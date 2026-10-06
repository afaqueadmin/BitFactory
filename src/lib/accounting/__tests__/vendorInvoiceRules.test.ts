import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/r2", () => ({ deleteObject: vi.fn() }));

import { Decimal } from "@prisma/client/runtime/library";
import { deleteObject } from "@/lib/storage/r2";
import {
  checkVendorInvoiceUpdate,
  deleteInvoicePdfs,
} from "../vendorInvoiceRules";

const paidDate = new Date("2026-09-30T00:00:00.000Z");
const paid = {
  paymentStatus: "Paid" as const,
  paidDate,
  amounts: { unitPrice: new Decimal("50"), totalAmount: new Decimal("100") },
};
const pending = { ...paid, paymentStatus: "Pending" as const, paidDate: null };

describe("checkVendorInvoiceUpdate", () => {
  it("lets the edit modal re-send unchanged status, date and amounts", () => {
    expect(
      checkVendorInvoiceUpdate(paid, {
        paymentStatus: "Paid",
        paidDate: paidDate.toISOString(),
        amounts: { unitPrice: 50, totalAmount: 100 },
      }),
    ).toBeNull();
  });

  it("blocks switching to Paid outside record-payment", () => {
    expect(
      checkVendorInvoiceUpdate(pending, {
        paymentStatus: "Paid",
        amounts: {},
      }),
    ).toMatch(/Record Payment/);
  });

  it("allows Pending -> Cancelled", () => {
    expect(
      checkVendorInvoiceUpdate(pending, {
        paymentStatus: "Cancelled",
        amounts: {},
      }),
    ).toBeNull();
  });

  it("blocks moving a Paid invoice to another status", () => {
    expect(
      checkVendorInvoiceUpdate(paid, {
        paymentStatus: "Cancelled",
        amounts: {},
      }),
    ).not.toBeNull();
  });

  it("blocks changing the paid date", () => {
    expect(
      checkVendorInvoiceUpdate(pending, {
        paidDate: "2026-10-01",
        amounts: {},
      }),
    ).not.toBeNull();
  });

  it("treats a float-recomputed total as unchanged", () => {
    expect(
      checkVendorInvoiceUpdate(
        { ...paid, amounts: { totalAmount: new Decimal("925.50") } },
        { amounts: { totalAmount: 75 * 12.34 } },
      ),
    ).toBeNull();
  });

  it("locks amounts on Paid invoices only (Q3)", () => {
    expect(
      checkVendorInvoiceUpdate(paid, { amounts: { totalAmount: 120 } }),
    ).toMatch(/paid invoice/);
    expect(
      checkVendorInvoiceUpdate(pending, { amounts: { totalAmount: 120 } }),
    ).toBeNull();
  });
});

describe("deleteInvoicePdfs", () => {
  it("deletes each non-empty key", async () => {
    await deleteInvoicePdfs(["a.pdf", null, undefined, "b.pdf"]);
    expect(vi.mocked(deleteObject).mock.calls).toEqual([["a.pdf"], ["b.pdf"]]);
  });

  it("throws when a delete fails", async () => {
    vi.mocked(deleteObject).mockRejectedValueOnce(new Error("R2 down"));
    await expect(deleteInvoicePdfs(["c.pdf"])).rejects.toThrow("R2 down");
  });
});
