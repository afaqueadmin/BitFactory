import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getInvoiceForPayer = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const createPaymentForInvoice = vi.hoisted(() => vi.fn());

vi.mock("@/lib/accounting/invoicePayerAccess", () => ({ getInvoiceForPayer }));
vi.mock("@/lib/prisma", () => ({
  prisma: { confirmoPayment: { findUnique } },
}));
vi.mock("@/services/confirmoPaymentService", () => ({
  ConfirmoPaymentService: class {
    createPaymentForInvoice = createPaymentForInvoice;
  },
}));

import { GET, POST } from "@/app/api/invoices/[id]/confirmo-payment/route";

const req = (method: string) =>
  new NextRequest("http://localhost/api/invoices/inv1/confirmo-payment", {
    method,
  });
const ctx = { params: Promise.resolve({ id: "inv1" }) };
const forbidden = {
  error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
};

beforeEach(() => vi.clearAllMocks());

describe("confirmo-payment: only the invoice's payer (O1)", () => {
  it("GET refuses someone else's invoice and reads nothing", async () => {
    getInvoiceForPayer.mockResolvedValue(forbidden);
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("POST refuses someone else's invoice and creates no link", async () => {
    getInvoiceForPayer.mockResolvedValue(forbidden);
    const res = await POST(req("POST"), ctx);
    expect(res.status).toBe(403);
    expect(createPaymentForInvoice).not.toHaveBeenCalled();
  });

  it("GET returns the record to the payer", async () => {
    getInvoiceForPayer.mockResolvedValue({
      invoice: { id: "inv1" },
      userId: "customer",
      role: "CLIENT",
    });
    findUnique.mockResolvedValue({ id: "cp1", invoiceId: "inv1" });
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(200);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { invoiceId: "inv1" } }),
    );
  });

  it("POST creates the link for the payer", async () => {
    getInvoiceForPayer.mockResolvedValue({
      invoice: { id: "inv1" },
      userId: "customer",
      role: "CLIENT",
    });
    createPaymentForInvoice.mockResolvedValue({ success: true });
    const res = await POST(req("POST"), ctx);
    expect(res.status).toBe(200);
    expect(createPaymentForInvoice).toHaveBeenCalledWith("inv1", "customer");
  });
});
