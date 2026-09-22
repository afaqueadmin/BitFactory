import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

// verifyJwtToken dynamically imports this module (see jwt.ts for why: it must
// stay out of the Edge bundle middleware loads). Mocked so these stay fast,
// deterministic unit tests instead of silently depending on a live database -
// the flaky Neon connection seen all session would otherwise make this suite
// fail intermittently for reasons unrelated to what it's testing.
const isTokenBlacklisted = vi.fn().mockResolvedValue(false);
vi.mock("@/lib/auth/tokenBlacklist", () => ({
  isTokenBlacklisted: (...args: unknown[]) => isTokenBlacklisted(...args),
}));

import { generateTokens, signJwtToken, verifyJwtToken } from "@/lib/jwt";
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
