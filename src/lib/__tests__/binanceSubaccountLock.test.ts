import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: { binanceSubaccount: { updateMany } },
}));

import {
  LOCK_TTL_MS,
  acquireLock,
  clearExpiredLocks,
  clearLock,
  releaseLock,
} from "@/lib/binanceSubaccountLock";

const NOW = new Date("2026-11-21T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("acquireLock", () => {
  it("locks when free, expired, or already held by the same user", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const res = await acquireLock("sub1", "userA");

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "sub1",
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: new Date(NOW.getTime() - LOCK_TTL_MS) } },
          { lockedBy: "userA" },
        ],
      },
      data: { lockedAt: NOW, lockedBy: "userA" },
    });
    expect(res).toEqual({
      ok: true,
      lockedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
    });
  });

  it("fails when another user holds an unexpired lock", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    expect(await acquireLock("sub1", "userB")).toEqual({ ok: false });
  });
});

describe("releaseLock", () => {
  it("only clears a lock held by the given user", async () => {
    await releaseLock("sub1", "userA");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "sub1", lockedBy: "userA" },
      data: { lockedAt: null, lockedBy: null },
    });
  });
});

describe("clearLock", () => {
  it("clears regardless of holder", async () => {
    await clearLock("sub1");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "sub1" },
      data: { lockedAt: null, lockedBy: null },
    });
  });
});

describe("clearExpiredLocks", () => {
  it("clears locks older than 5 minutes and returns the count", async () => {
    updateMany.mockResolvedValue({ count: 3 });
    expect(await clearExpiredLocks()).toBe(3);
    expect(updateMany).toHaveBeenCalledWith({
      where: { lockedAt: { lt: new Date(NOW.getTime() - 300_000) } },
      data: { lockedAt: null, lockedBy: null },
    });
  });
});
