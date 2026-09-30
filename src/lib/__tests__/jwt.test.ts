import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

// verifyJwtToken dynamically imports this module (see jwt.ts for why: it must
// stay out of the Edge bundle middleware loads). Mocked so these stay fast,
// deterministic unit tests instead of silently depending on a live database -
// the flaky Neon connection seen all session would otherwise make this suite
// fail intermittently for reasons unrelated to what it's testing.
const isTokenBlacklisted = vi.fn().mockResolvedValue(false);
const isTokenRevokedForUser = vi.fn().mockResolvedValue(false);
vi.mock("@/lib/auth/tokenBlacklist", () => ({
  isTokenBlacklisted: (...args: unknown[]) => isTokenBlacklisted(...args),
  isTokenRevokedForUser: (...args: unknown[]) => isTokenRevokedForUser(...args),
}));

import {
  generateTokens,
  signEnrollmentToken,
  signJwtToken,
  signPendingTwoFactorToken,
  signAuthenticationChallenge,
  signRegistrationChallenge,
  verifyAuthenticationChallenge,
  verifyEnrollmentToken,
  verifyJwtToken,
  verifyPendingTwoFactorToken,
  verifyRegistrationChallenge,
} from "@/lib/jwt";
import { getUserInfoFromToken } from "@/lib/helpers/getUserInfoFromToken";

const TEST_SECRET = "test-secret-".padEnd(64, "x");
const OLD_FALLBACK_SECRET = "your-secret-key";

async function forgeTokenWith(secret: string) {
  return new SignJWT({ userId: "attacker", role: "SUPER_ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

describe("JWT secret handling", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    isTokenBlacklisted.mockReset().mockResolvedValue(false);
    isTokenRevokedForUser.mockReset().mockResolvedValue(false);
  });

  describe("with JWT_SECRET set", () => {
    beforeEach(() => {
      vi.stubEnv("JWT_SECRET", TEST_SECRET);
    });

    it("round-trips access and refresh tokens", async () => {
      const { accessToken, refreshToken } = await generateTokens(
        "user-1",
        "CLIENT",
      );

      const access = await verifyJwtToken(accessToken);
      expect(access.userId).toBe("user-1");
      expect(access.role).toBe("CLIENT");

      const refresh = await verifyJwtToken(refreshToken);
      expect(refresh.type).toBe("refresh");
    });

    it("rejects a token forged with the old hardcoded fallback secret", async () => {
      const forged = await forgeTokenWith(OLD_FALLBACK_SECRET);

      await expect(verifyJwtToken(forged)).rejects.toThrow(
        "Invalid or expired token",
      );
      expect(await getUserInfoFromToken(forged)).toEqual({ userId: null });
    });

    it("getUserInfoFromToken returns the userId for a valid token", async () => {
      const { accessToken } = await generateTokens("user-2", "FRANCHISEE");

      expect(await getUserInfoFromToken(accessToken)).toEqual({
        userId: "user-2",
      });
    });

    it("getUserInfoFromToken returns a null userId for garbage input", async () => {
      expect(await getUserInfoFromToken("not-a-jwt")).toEqual({
        userId: null,
      });
    });

    it("rejects a signature-valid token that has been blacklisted (logged out)", async () => {
      const { accessToken } = await generateTokens("user-3", "CLIENT");
      isTokenBlacklisted.mockResolvedValue(true);

      await expect(verifyJwtToken(accessToken)).rejects.toThrow(
        "Invalid or expired token",
      );
      expect(isTokenBlacklisted).toHaveBeenCalledWith(accessToken);
    });

    it("carries the mfa claim on both tokens only when asked", async () => {
      const plain = await generateTokens("user-5", "ADMIN");
      expect((await verifyJwtToken(plain.accessToken)).mfa).toBeUndefined();

      const withMfa = await generateTokens("user-5", "ADMIN", { mfa: true });
      expect((await verifyJwtToken(withMfa.accessToken)).mfa).toBe(true);
      const refresh = await verifyJwtToken(withMfa.refreshToken);
      expect(refresh.mfa).toBe(true);
      expect(refresh.type).toBe("refresh");
    });

    it("never accepts a 2FA-enrollment token as a session", async () => {
      const enroll = await signEnrollmentToken("user-6", "ADMIN");

      await expect(verifyJwtToken(enroll)).rejects.toThrow(
        "Invalid or expired token",
      );
      expect(await getUserInfoFromToken(enroll)).toEqual({ userId: null });
      expect((await verifyEnrollmentToken(enroll)).userId).toBe("user-6");
    });

    it("never accepts a pending-2FA token as a session", async () => {
      const pending = await signPendingTwoFactorToken("user-8", "CLIENT");

      await expect(verifyJwtToken(pending)).rejects.toThrow(
        "Invalid or expired token",
      );
      expect(await getUserInfoFromToken(pending)).toEqual({ userId: null });
      expect((await verifyPendingTwoFactorToken(pending)).userId).toBe(
        "user-8",
      );
    });

    it("keeps the two login-step tokens distinct", async () => {
      const pending = await signPendingTwoFactorToken("user-9", "CLIENT");
      const enroll = await signEnrollmentToken("user-9", "CLIENT");
      const { accessToken } = await generateTokens("user-9", "CLIENT");

      await expect(verifyEnrollmentToken(pending)).rejects.toThrow(
        "Invalid or expired enrollment token",
      );
      await expect(verifyPendingTwoFactorToken(enroll)).rejects.toThrow(
        "Invalid or expired pending 2FA token",
      );
      await expect(verifyPendingTwoFactorToken(accessToken)).rejects.toThrow(
        "Invalid or expired pending 2FA token",
      );
    });

    it("binds a passkey-registration challenge to its user and never treats it as a session", async () => {
      const token = await signRegistrationChallenge(
        "user-10",
        "CLIENT",
        "chal-abc",
      );

      expect(await verifyRegistrationChallenge(token)).toEqual({
        userId: "user-10",
        challenge: "chal-abc",
      });
      await expect(verifyJwtToken(token)).rejects.toThrow(
        "Invalid or expired token",
      );
      const { accessToken } = await generateTokens("user-10", "CLIENT");
      await expect(verifyRegistrationChallenge(accessToken)).rejects.toThrow(
        "Invalid or expired passkey registration token",
      );
    });

    it("binds a passkey sign-in challenge to its user, apart from registration and sessions (N-5)", async () => {
      const token = await signAuthenticationChallenge("user-11", "chal-xyz");

      expect(await verifyAuthenticationChallenge(token)).toMatchObject({
        userId: "user-11",
        challenge: "chal-xyz",
      });
      await expect(verifyJwtToken(token)).rejects.toThrow(
        "Invalid or expired token",
      );
      await expect(verifyRegistrationChallenge(token)).rejects.toThrow(
        "Invalid or expired passkey registration token",
      );
      const reg = await signRegistrationChallenge("user-11", "CLIENT", "c");
      await expect(verifyAuthenticationChallenge(reg)).rejects.toThrow(
        "Invalid or expired passkey sign-in token",
      );
    });

    it("rejects a passkey sign-in challenge that was already used (N-5)", async () => {
      const token = await signAuthenticationChallenge("user-12", "c");
      isTokenBlacklisted.mockResolvedValue(true);

      await expect(verifyAuthenticationChallenge(token)).rejects.toThrow(
        "Invalid or expired passkey sign-in token",
      );
    });

    it("never accepts a session token as an enrollment token", async () => {
      const { accessToken, refreshToken } = await generateTokens(
        "user-7",
        "CLIENT",
      );

      await expect(verifyEnrollmentToken(accessToken)).rejects.toThrow(
        "Invalid or expired enrollment token",
      );
      await expect(verifyEnrollmentToken(refreshToken)).rejects.toThrow(
        "Invalid or expired enrollment token",
      );
    });

    it("skips the blacklist check on the Edge runtime (middleware) instead of failing to bundle it", async () => {
      vi.stubEnv("NEXT_RUNTIME", "edge");
      const { accessToken } = await generateTokens("user-4", "CLIENT");
      // If this ran, the token would be rejected - proving the skip, not
      // just that the check happened to return false.
      isTokenBlacklisted.mockResolvedValue(true);

      const payload = await verifyJwtToken(accessToken);

      expect(payload.userId).toBe("user-4");
      expect(isTokenBlacklisted).not.toHaveBeenCalled();
    });

    it("rejects a session issued before the account was signed out everywhere (N-2)", async () => {
      const { accessToken, refreshToken } = await generateTokens(
        "user-6",
        "CLIENT",
      );
      isTokenRevokedForUser.mockResolvedValue(true);

      await expect(verifyJwtToken(accessToken)).rejects.toThrow(
        "Invalid or expired token",
      );
      await expect(verifyJwtToken(refreshToken)).rejects.toThrow(
        "Invalid or expired token",
      );
      expect(isTokenRevokedForUser).toHaveBeenCalledWith(
        "user-6",
        expect.any(Number),
      );
    });

    it("also rejects a half-finished login once the account is signed out everywhere", async () => {
      const pending = await signPendingTwoFactorToken("user-7", "CLIENT");
      const enroll = await signEnrollmentToken("user-7", "CLIENT");
      isTokenRevokedForUser.mockResolvedValue(true);

      await expect(verifyPendingTwoFactorToken(pending)).rejects.toThrow(
        "Invalid or expired pending 2FA token",
      );
      await expect(verifyEnrollmentToken(enroll)).rejects.toThrow(
        "Invalid or expired enrollment token",
      );
    });
  });

  describe("with JWT_SECRET unset", () => {
    beforeEach(() => {
      vi.stubEnv("JWT_SECRET", "");
    });

    it("refuses to sign tokens", async () => {
      await expect(
        signJwtToken({ userId: "user-1", role: "CLIENT" }),
      ).rejects.toThrow("JWT_SECRET environment variable is not set");
    });

    it("fails closed instead of accepting a token signed with the old fallback", async () => {
      const forged = await forgeTokenWith(OLD_FALLBACK_SECRET);

      await expect(verifyJwtToken(forged)).rejects.toThrow(
        "Invalid or expired token",
      );
      expect(await getUserInfoFromToken(forged)).toEqual({ userId: null });
    });
  });
});
