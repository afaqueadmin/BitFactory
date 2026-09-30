import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tokenBlacklist: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  isTokenBlacklisted,
  isTokenRevokedForUser,
} from "@/lib/auth/tokenBlacklist";

const findEntry = vi.mocked(prisma.tokenBlacklist.findUnique);
const findUser = vi.mocked(prisma.user.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isTokenBlacklisted", () => {
  it("is false for a token that was never logged out", async () => {
    findEntry.mockResolvedValue(null);

    expect(await isTokenBlacklisted("live-token")).toBe(false);
    expect(findEntry).toHaveBeenCalledWith({
      where: { token: "live-token" },
      select: { id: true },
    });
  });

  it("is true for a logged-out token", async () => {
    findEntry.mockResolvedValue({ id: "row-1" } as never);

    expect(await isTokenBlacklisted("revoked-token")).toBe(true);
  });
});

describe("isTokenRevokedForUser (N-2)", () => {
  // Cutoff stored rounded down to a whole second, as sessionCutoffNow does.
  const cutoff = new Date("2026-09-30T10:00:00.000Z");
  const cutoffSeconds = cutoff.getTime() / 1000;

  it("is false when the account was never signed out everywhere", async () => {
    findUser.mockResolvedValue({ sessionsValidAfter: null } as never);
    expect(await isTokenRevokedForUser("u1", 1)).toBe(false);
  });

  it("is true for a token issued before the cutoff", async () => {
    findUser.mockResolvedValue({ sessionsValidAfter: cutoff } as never);
    expect(await isTokenRevokedForUser("u1", cutoffSeconds - 1)).toBe(true);
  });

  it("is false for a token issued in the cutoff second or later", async () => {
    findUser.mockResolvedValue({ sessionsValidAfter: cutoff } as never);
    expect(await isTokenRevokedForUser("u1", cutoffSeconds)).toBe(false);
    expect(await isTokenRevokedForUser("u1", cutoffSeconds + 60)).toBe(false);
  });

  it("is true for a token without iat once a cutoff exists", async () => {
    findUser.mockResolvedValue({ sessionsValidAfter: cutoff } as never);
    expect(await isTokenRevokedForUser("u1", undefined)).toBe(true);
  });

  it("is true when the user no longer exists", async () => {
    findUser.mockResolvedValue(null);
    expect(await isTokenRevokedForUser("gone", cutoffSeconds + 60)).toBe(true);
  });
});
