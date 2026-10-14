import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tokenBlacklist: { findUnique: vi.fn() },
    userLogin: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  isTokenBlacklisted,
  isTokenRevokedForUser,
} from "@/lib/auth/tokenBlacklist";

const findEntry = vi.mocked(prisma.tokenBlacklist.findUnique);
const findLogin = vi.mocked(prisma.userLogin.findUnique);

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

  /** The login row as isTokenRevokedForUser reads it. */
  function login({
    userId = "u1",
    accountCutoff = null,
    loginCutoff = null,
  }: {
    userId?: string;
    accountCutoff?: Date | null;
    loginCutoff?: Date | null;
  } = {}) {
    return {
      userId,
      sessionsValidAfter: loginCutoff,
      user: { sessionsValidAfter: accountCutoff },
    } as never;
  }

  it("is false when neither the account nor the login was signed out everywhere", async () => {
    findLogin.mockResolvedValue(login());
    expect(await isTokenRevokedForUser("u1", "l1", 1)).toBe(false);
    expect(findLogin).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "l1" } }),
    );
  });

  it.each([
    ["account", { accountCutoff: cutoff }],
    ["login", { loginCutoff: cutoff }],
  ])(
    "is true for a token issued before the %s cutoff",
    async (_label, cutoffs) => {
      findLogin.mockResolvedValue(login(cutoffs));
      expect(await isTokenRevokedForUser("u1", "l1", cutoffSeconds - 1)).toBe(
        true,
      );
    },
  );

  it("is false for a token issued in the cutoff second or later", async () => {
    findLogin.mockResolvedValue(
      login({ accountCutoff: cutoff, loginCutoff: cutoff }),
    );
    expect(await isTokenRevokedForUser("u1", "l1", cutoffSeconds)).toBe(false);
    expect(await isTokenRevokedForUser("u1", "l1", cutoffSeconds + 60)).toBe(
      false,
    );
  });

  it("uses the later of the two cutoffs", async () => {
    const later = new Date(cutoff.getTime() + 3600_000);
    findLogin.mockResolvedValue(
      login({ accountCutoff: cutoff, loginCutoff: later }),
    );
    expect(await isTokenRevokedForUser("u1", "l1", cutoffSeconds + 60)).toBe(
      true,
    );
  });

  it("is true for a token without iat once a cutoff exists", async () => {
    findLogin.mockResolvedValue(login({ loginCutoff: cutoff }));
    expect(await isTokenRevokedForUser("u1", "l1", undefined)).toBe(true);
  });

  it("is true when the login no longer exists (removed, or account gone)", async () => {
    findLogin.mockResolvedValue(null);
    expect(await isTokenRevokedForUser("u1", "gone", cutoffSeconds + 60)).toBe(
      true,
    );
  });

  it("is true when the login belongs to a different account than the token says", async () => {
    findLogin.mockResolvedValue(login({ userId: "u2" }));
    expect(await isTokenRevokedForUser("u1", "l1", cutoffSeconds + 60)).toBe(
      true,
    );
  });
});
