import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const clearExpiredLocks = vi.hoisted(() => vi.fn());
const sendCronFailureEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/binanceSubaccountLock", () => ({ clearExpiredLocks }));
vi.mock("@/lib/services/cronRetry", () => ({
  waitForDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/email", () => ({ sendCronFailureEmail }));

import { GET } from "@/app/api/cron_binance_subaccount_unlock/route";

const req = (auth?: string) =>
  new NextRequest("http://localhost/api/cron_binance_subaccount_unlock", {
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.CRON_SECRET = "s3cret";
});

describe("cron_binance_subaccount_unlock", () => {
  it("rejects requests without the CRON_SECRET", async () => {
    const res = await GET(req("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(clearExpiredLocks).not.toHaveBeenCalled();
  });

  it("clears expired locks and reports the count", async () => {
    clearExpiredLocks.mockResolvedValue(2);
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, cleared: 2 });
  });

  it("emails and returns 500 on failure", async () => {
    clearExpiredLocks.mockRejectedValue(new Error("db down"));
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(500);
    expect(sendCronFailureEmail).toHaveBeenCalledWith(
      "cron_binance_subaccount_unlock",
      "db down",
      "admin",
    );
  });
});
