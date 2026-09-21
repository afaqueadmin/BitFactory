import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
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
