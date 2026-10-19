import { describe, expect, it, vi } from "vitest";

// buildSimInvoice is pure; keep the loader's DB imports out of the test.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/paybackConfigHelpers", () => ({
  getOrCreatePaybackConfig: vi.fn(),
}));

import { SIM_INVOICE_ID, buildSimInvoice } from "@/lib/simulation/invoice";

const pricing = {
  defaultInvoicedAmount: 4250,
  s21xpMonthlyInvoicingAmount: 425.5,
  s21proMonthlyInvoicingAmount: 300,
};

const ctxFor = (model: string) => ({
  userId: "sim-user",
  since: new Date("2026-10-19T09:30:00Z"),
  demoMiner: {
    hardware: { id: "hw1", model, powerUsage: 3.645, hashRate: "270" },
    space: { location: "Ethiopia", name: "Site A" },
  } as never,
});

describe("buildSimInvoice", () => {
  it("bills hardware at the invoiced amount plus the first month's hosting, like a real Hardware Sales invoice", () => {
    const inv = buildSimInvoice({
      ctx: ctxFor("Bitmain S21XP"),
      user: { name: "Jane Doe", email: "jane@example.com" },
      pricing,
    });
    expect(inv.id).toBe(SIM_INVOICE_ID);
    expect(inv.invoiceType).toBe("HARDWARE_SALES");
    expect(inv.status).toBe("ISSUED");
    expect(inv.paidDate).toBeNull();
    expect(inv.totalAmount).toBe(4675.5);
    expect(inv.unitPrice).toBe(4250);
    expect(
      inv.lineItems.map((li) => [li.lineItemType, li.model, li.totalPrice]),
    ).toEqual([
      ["HARDWARE", "Bitmain S21XP", 4250],
      [
        "HOSTING_COLOCATION",
        "Hosting & Colocation (Bitmain S21XP) – Oct 2026",
        425.5,
      ],
    ]);
    expect(inv.lineItems[1].billingMonth?.toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
    expect(inv.lineItems[0].billingMonth).toBeNull();
  });

  it("uses the S21 Pro hosting amount for a non-XP miner", () => {
    const inv = buildSimInvoice({
      ctx: ctxFor("Bitmain S21 Pro"),
      user: { name: null, email: "x@example.com" },
      pricing,
    });
    expect(inv.lineItems.map((li) => li.totalPrice)).toEqual([4250, 300]);
    expect(inv.totalAmount).toBe(4550);
  });

  it("is issued at registration and due a week later", () => {
    const inv = buildSimInvoice({
      ctx: ctxFor("Bitmain S21XP"),
      user: { name: "Jane Doe", email: "jane@example.com" },
      pricing,
    });
    expect(inv.issuedDate.toISOString()).toBe("2026-10-19T09:30:00.000Z");
    expect(inv.dueDate.toISOString()).toBe("2026-10-26T09:30:00.000Z");
    expect(inv.billingMonth.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(inv.machineHostingLocation).toEqual(["Ethiopia"]);
  });

  it("numbers it like a real invoice for an account with no subaccount", () => {
    const named = buildSimInvoice({
      ctx: ctxFor("Bitmain S21XP"),
      user: { name: "  Jane Doe ", email: "jane@example.com" },
      pricing,
    });
    expect(named.invoiceNumber).toMatch(/^Jane-\d{8}-1$/);
    const unnamed = buildSimInvoice({
      ctx: ctxFor("Bitmain S21XP"),
      user: { name: null, email: "x@example.com" },
      pricing,
    });
    expect(unnamed.invoiceNumber).toMatch(/^Customer-\d{8}-1$/);
  });
});
