import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { tokenBlacklist: { findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { isTokenBlacklisted } from "@/lib/auth/tokenBlacklist";

const findEntry = vi.mocked(prisma.tokenBlacklist.findUnique);

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
