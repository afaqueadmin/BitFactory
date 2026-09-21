import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    authAttempt: {
      create: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  buildRateLimitKey,
  checkRateLimit,
  clearRateLimit,
  getClientIp,
} from "@/lib/rateLimit";

const db = vi.mocked(prisma.authAttempt);
const NOW = new Date("2026-09-21T12:00:00.000Z");
const OPTS = { max: 5, windowSeconds: 900 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // Never trigger the random purge unless a test asks for it.
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  db.create.mockResolvedValue({} as never);
  db.deleteMany.mockResolvedValue({ count: 0 } as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("buildRateLimitKey", () => {
  it("normalizes case and whitespace", () => {
    expect(buildRateLimitKey("login", "email", "  Foo@Bar.COM ")).toBe(
      "login:email:foo@bar.com",
    );
  });

  it("bounds the identifier length", () => {
    const key = buildRateLimitKey("login", "ip", "x".repeat(5000));
    expect(key.length).toBe("login:ip:".length + 254);
  });
});

describe("getClientIp", () => {
  it("uses the first x-forwarded-for entry", () => {
    const h = new Headers({ "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" });
    expect(getClientIp(h)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe(
      "198.51.100.4",
    );
  });

  it("returns null rather than a shared placeholder when no header exists", () => {
    expect(getClientIp(new Headers())).toBeNull();
    expect(getClientIp(new Headers({ "x-forwarded-for": "" }))).toBeNull();
  });
});

describe("checkRateLimit", () => {
  it("records the attempt before counting (closes the parallel-burst race)", async () => {
    db.count.mockResolvedValue(1);

    await checkRateLimit("login:email:a@b.com", OPTS);

    expect(db.create.mock.invocationCallOrder[0]).toBeLessThan(
      db.count.mock.invocationCallOrder[0],
    );
    expect(db.create).toHaveBeenCalledWith({
      data: { key: "login:email:a@b.com" },
    });
  });

  it("counts only attempts inside the window", async () => {
    db.count.mockResolvedValue(1);

    await checkRateLimit("k", OPTS);

    expect(db.count).toHaveBeenCalledWith({
      where: {
        key: "k",
        createdAt: { gt: new Date(NOW.getTime() - 900 * 1000) },
      },
    });
  });

  it("allows attempts up to and including max, reporting what remains", async () => {
    db.count.mockResolvedValueOnce(1);
    expect(await checkRateLimit("k", OPTS)).toEqual({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 0,
    });

    db.count.mockResolvedValueOnce(5);
    expect(await checkRateLimit("k", OPTS)).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0,
    });
  });

  it("blocks the attempt after max and says when to retry", async () => {
    // 6 rows in the window, max 5: the 2nd-oldest row (skip 1) must expire.
    db.count.mockResolvedValue(6);
    db.findFirst.mockResolvedValue({
      createdAt: new Date(NOW.getTime() - 600 * 1000),
    } as never);

    const result = await checkRateLimit("k", OPTS);

    expect(result).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 300,
    });
    expect(db.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" }, skip: 1 }),
    );
  });

  it("never reports a retry time under one second", async () => {
    db.count.mockResolvedValue(6);
    db.findFirst.mockResolvedValue({
      createdAt: new Date(NOW.getTime() - 900 * 1000),
    } as never);

    expect((await checkRateLimit("k", OPTS)).retryAfterSeconds).toBe(1);
  });

  it.each([0, -5, 24 * 60 * 60 + 1, Number.NaN])(
    "rejects window %s without touching the database",
    async (windowSeconds) => {
      await expect(
        checkRateLimit("k", { max: 5, windowSeconds }),
      ).rejects.toThrow(RangeError);
      expect(db.create).not.toHaveBeenCalled();
    },
  );

  it("purges rows older than 24h occasionally", async () => {
    db.count.mockResolvedValue(1);
    vi.spyOn(Math, "random").mockReturnValue(0.001);

    await checkRateLimit("k", OPTS);

    expect(db.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000) },
      },
    });
  });

  it("does not purge on most calls", async () => {
    db.count.mockResolvedValue(1);

    await checkRateLimit("k", OPTS);

    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it("never fails the request if the purge errors", async () => {
    db.count.mockResolvedValue(1);
    vi.spyOn(Math, "random").mockReturnValue(0.001);
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.deleteMany.mockRejectedValue(new Error("db hiccup"));

    await expect(checkRateLimit("k", OPTS)).resolves.toMatchObject({
      allowed: true,
    });
  });
});

describe("clearRateLimit", () => {
  it("deletes only the given key", async () => {
    await clearRateLimit("login:email:a@b.com");

    expect(db.deleteMany).toHaveBeenCalledWith({
      where: { key: "login:email:a@b.com" },
    });
  });
});
