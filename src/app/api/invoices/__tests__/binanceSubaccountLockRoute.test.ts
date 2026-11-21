import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getInvoiceForPayer = vi.hoisted(() => vi.fn());
const getUserBinanceSubaccount = vi.hoisted(() => vi.fn());
const acquireLock = vi.hoisted(() => vi.fn());
const releaseLock = vi.hoisted(() => vi.fn());
const invoiceUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/accounting/invoicePayerAccess", () => ({ getInvoiceForPayer }));
vi.mock("@/lib/binanceSubaccountLock", () => ({ acquireLock, releaseLock }));
vi.mock("@/lib/prisma", () => ({
  prisma: { invoice: { update: invoiceUpdate } },
}));
vi.mock("@/lib/binanceSubaccounts", () => ({
  getUserBinanceSubaccount,
  subaccountAddress: (s: { TRXAddress?: string }) => s.TRXAddress ?? null,
  SUBACCOUNT_NETWORK_LABELS: { TRX: "TRON (TRC20)" },
}));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,x") },
}));

import { DELETE, POST } from "@/app/api/invoices/[id]/binance-subaccount/route";

const req = (method: string) =>
  new NextRequest("http://localhost/api/invoices/inv1/binance-subaccount", {
    method,
  });
const ctx = { params: Promise.resolve({ id: "inv1" }) };

const invoice = {
  id: "inv1",
  userId: "customer",
  status: "PENDING",
  totalAmount: { toFixed: () => "100.00" },
  binanceCheckoutStartedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  getInvoiceForPayer.mockResolvedValue({ invoice, userId: "payerA" });
  getUserBinanceSubaccount.mockResolvedValue({
    id: "sub1",
    TRXAddress: "T123",
  });
});

describe("POST binance-subaccount (lock)", () => {
  it("acquires the lock for the payer and returns expiry", async () => {
    const lockedAt = new Date("2026-11-21T12:00:00Z");
    const expiresAt = new Date("2026-11-21T12:05:00Z");
    acquireLock.mockResolvedValue({ ok: true, lockedAt, expiresAt });

    const res = await POST(req("POST"), ctx);
    const body = await res.json();

    expect(acquireLock).toHaveBeenCalledWith("sub1", "payerA");
    expect(res.status).toBe(200);
    expect(body.expiresAt).toBe(expiresAt.toISOString());
    expect(body.networks).toHaveLength(1);
  });

  it("returns 423 SUBACCOUNT_LOCKED when another user holds the lock", async () => {
    acquireLock.mockResolvedValue({ ok: false });

    const res = await POST(req("POST"), ctx);

    expect(res.status).toBe(423);
    expect((await res.json()).code).toBe("SUBACCOUNT_LOCKED");
  });

  it("does not try to lock when the subaccount isn't set up", async () => {
    getUserBinanceSubaccount.mockResolvedValue(null);
    const res = await POST(req("POST"), ctx);
    expect(res.status).toBe(409);
    expect(acquireLock).not.toHaveBeenCalled();
  });

  it("does not try to lock for a paid invoice", async () => {
    getInvoiceForPayer.mockResolvedValue({
      invoice: { ...invoice, status: "PAID" },
      userId: "payerA",
    });
    const res = await POST(req("POST"), ctx);
    expect(res.status).toBe(409);
    expect(acquireLock).not.toHaveBeenCalled();
  });
});

describe("DELETE binance-subaccount (release)", () => {
  it("releases only the caller's lock", async () => {
    const res = await DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(200);
    expect(releaseLock).toHaveBeenCalledWith("sub1", "payerA");
  });

  it("returns the auth error unchanged", async () => {
    getInvoiceForPayer.mockResolvedValue({
      error: new Response("no", { status: 401 }),
    });
    const res = await DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(401);
    expect(releaseLock).not.toHaveBeenCalled();
  });
});
