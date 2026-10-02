import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: vi.fn() } },
}));

vi.mock("@/lib/auth/tokenBlacklist", () => ({
  isTokenBlacklisted: vi.fn(),
  isTokenRevokedForUser: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  isTokenBlacklisted,
  isTokenRevokedForUser,
} from "@/lib/auth/tokenBlacklist";
import {
  generateTokens,
  signPasswordResetToken,
  verifyJwtToken,
} from "@/lib/jwt";
import {
  appBaseUrl,
  passwordFingerprint,
  resetLinkUrl,
  resolveResetLink,
} from "@/lib/auth/passwordReset";

const findUser = vi.mocked(prisma.user.findFirst);
const blacklisted = vi.mocked(isTokenBlacklisted);
const revoked = vi.mocked(isTokenRevokedForUser);

const HASH = "$2b$12$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234";
const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

function storedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "owner@example.com",
    password: HASH,
    twoFactorAuth: null,
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test-secret-for-password-reset";
  blacklisted.mockResolvedValue(false);
  revoked.mockResolvedValue(false);
});

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
});

describe("reset link URL", () => {
  it("uses the configured app origin and puts the token in the fragment", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/some/path";
    expect(resetLinkUrl("a.b+c")).toBe(
      "https://app.example.com/reset-password#token=a.b%2Bc",
    );
  });

  it("falls back to the production origin when the setting is malformed", () => {
    process.env.NEXT_PUBLIC_APP_URL = "0https://my.bitfactory.ae";
    expect(appBaseUrl()).toBe("https://my.bitfactory.ae");
  });

  it("rejects non-web schemes", () => {
    process.env.NEXT_PUBLIC_APP_URL = "javascript:alert(1)";
    expect(appBaseUrl()).toBe("https://my.bitfactory.ae");
  });
});

describe("passwordFingerprint", () => {
  it("is stable for a hash and changes when the hash changes", () => {
    expect(passwordFingerprint(HASH)).toBe(passwordFingerprint(HASH));
    expect(passwordFingerprint(HASH)).not.toBe(passwordFingerprint(HASH + "x"));
    expect(passwordFingerprint(HASH)).not.toContain(HASH.slice(7, 20));
  });
});

describe("resolveResetLink", () => {
  it("accepts a fresh link for the current password", async () => {
    findUser.mockResolvedValue(storedUser());
    const token = await signPasswordResetToken(
      "u1",
      "CLIENT",
      passwordFingerprint(HASH),
    );
    const target = await resolveResetLink(token);
    expect(target).toMatchObject({
      userId: "u1",
      email: "owner@example.com",
      passwordHash: HASH,
      twoFactor: null,
    });
    expect(findUser).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1", isDeleted: false } }),
    );
  });

  it("reports 2FA when the account has it enabled", async () => {
    findUser.mockResolvedValue(
      storedUser({
        twoFactorAuth: { enabled: true, secret: "S", backupCodes: ["b"] },
      }),
    );
    const token = await signPasswordResetToken(
      "u1",
      "CLIENT",
      passwordFingerprint(HASH),
    );
    expect((await resolveResetLink(token))?.twoFactor).toEqual({
      secret: "S",
      backupCodes: ["b"],
    });
  });

  it("rejects a link once the password has changed", async () => {
    findUser.mockResolvedValue(storedUser({ password: HASH + "new" }));
    const token = await signPasswordResetToken(
      "u1",
      "CLIENT",
      passwordFingerprint(HASH),
    );
    expect(await resolveResetLink(token)).toBeNull();
  });

  it("rejects a used (blacklisted) link", async () => {
    blacklisted.mockResolvedValue(true);
    findUser.mockResolvedValue(storedUser());
    const token = await signPasswordResetToken(
      "u1",
      "CLIENT",
      passwordFingerprint(HASH),
    );
    expect(await resolveResetLink(token)).toBeNull();
  });

  it("rejects a link issued before the account was signed out everywhere", async () => {
    revoked.mockResolvedValue(true);
    findUser.mockResolvedValue(storedUser());
    const token = await signPasswordResetToken(
      "u1",
      "CLIENT",
      passwordFingerprint(HASH),
    );
    expect(await resolveResetLink(token)).toBeNull();
  });

  it("rejects a deleted or missing account", async () => {
    findUser.mockResolvedValue(null);
    const token = await signPasswordResetToken(
      "u1",
      "CLIENT",
      passwordFingerprint(HASH),
    );
    expect(await resolveResetLink(token)).toBeNull();
  });

  it("rejects session tokens, garbage and non-strings", async () => {
    findUser.mockResolvedValue(storedUser());
    const { accessToken } = await generateTokens("u1", "CLIENT");
    expect(await resolveResetLink(accessToken)).toBeNull();
    expect(await resolveResetLink("not-a-jwt")).toBeNull();
    expect(await resolveResetLink(42)).toBeNull();
    expect(await resolveResetLink("x".repeat(5000))).toBeNull();
  });

  it("is never accepted as a session", async () => {
    const token = await signPasswordResetToken(
      "u1",
      "CLIENT",
      passwordFingerprint(HASH),
    );
    await expect(verifyJwtToken(token)).rejects.toThrow();
  });
});
