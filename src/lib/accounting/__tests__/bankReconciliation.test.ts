import { describe, expect, it } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  isReconciliationInvoiceType,
  joinPaymentNotes,
  reconciliationAmounts,
  reconciliationEntryLabel,
  ReconciliationForRows,
  reconciliationStatementRows,
} from "../bankReconciliation";
import { buildStatement, transactionsAgainst } from "../bankStatementRows";
import {
  parseReconciliationListQuery,
  reconciliationListQuery,
  reconciliationListRows,
} from "../bankReconciliationLists";

const D = (v: number | string) => new Decimal(v);

const ok = (r: ReturnType<typeof reconciliationAmounts>) => {
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("reconciliationAmounts", () => {
  it("bank currency ÷ rate, to cents, for the amount and the fee", () => {
    const r = ok(
      reconciliationAmounts({
        code: "PKR",
        amount: D("280000"),
        fee: D("1400"),
        rate: D("280"),
      }),
    );
    expect(r.amountUsd.toFixed(2)).toBe("1000.00");
    expect(r.feeUsd.toFixed(2)).toBe("5.00");
  });

  it("allows a 0 amount (an invoice marked as paid with no amount)", () => {
    const r = ok(
      reconciliationAmounts({
        code: "USD",
        amount: D(0),
        fee: D(0),
        rate: D(1),
      }),
    );
    expect(r.amountUsd.toFixed(2)).toBe("0.00");
    expect(r.feeUsd.toFixed(2)).toBe("0.00");
  });

  it("refuses negatives, 3 decimals, a bad rate and USD not at 1", () => {
    const base = { code: "AED", amount: D(10), fee: D(0), rate: D("3.6725") };
    expect(reconciliationAmounts({ ...base, amount: D(-1) })).toHaveProperty(
      "error",
    );
    expect(
      reconciliationAmounts({ ...base, amount: D("1.234") }),
    ).toHaveProperty("error");
    expect(reconciliationAmounts({ ...base, fee: D(-1) })).toHaveProperty(
      "error",
    );
    expect(reconciliationAmounts({ ...base, rate: D(0) })).toHaveProperty(
      "error",
    );
    expect(
      reconciliationAmounts({ ...base, code: "USD", rate: D(2) }),
    ).toHaveProperty("error");
  });
});

describe("small helpers", () => {
  it("entry label, invoice types, joined notes", () => {
    expect(reconciliationEntryLabel(7)).toBe("REC-0007");
    expect(reconciliationEntryLabel(12345)).toBe("REC-12345");
    expect(isReconciliationInvoiceType("HARDWARE_SALES")).toBe(true);
    expect(isReconciliationInvoiceType("HARDWARE_PURCHASE")).toBe(false);
    expect(joinPaymentNotes(["pre paid", null, " ", "tx 12 "])).toBe(
      "pre paid · tx 12",
    );
  });
});

const entry = (over: Partial<ReconciliationForRows> = {}) =>
  ({
    id: "r1",
    date: new Date("2026-09-10T00:00:00.000Z"),
    createdAt: new Date("2026-11-19T10:00:00.000Z"),
    bankId: "bank1",
    code: "PKR",
    exchangeRate: D(280),
    amount: D(280000),
    fee: D(1400),
    amountUsd: D(1000),
    feeUsd: D(5),
    narration: "already pre paid",
    hasPdf: true,
    invoice: {
      id: "inv1",
      invoiceNumber: "HS-0042",
      invoiceType: "HARDWARE_SALES",
      totalAmount: D(1000),
    },
    clientName: "Jane Customer",
    ...over,
  }) satisfies ReconciliationForRows;

describe("reconciliationStatementRows", () => {
  it("a Debit with the invoice and client, plus a fee Credit", () => {
    const [a, f] = reconciliationStatementRows(entry());
    expect(a.id).toBe("br_r1_a");
    expect(a.side).toBe("DEBIT");
    expect(a.amountUsd.toFixed(2)).toBe("1000.00");
    expect(a.invoiceType).toBe("Hardware Sales");
    expect(a.invoices).toEqual([
      { number: "HS-0042", href: "/accounting/hardware-sales/inv1" },
    ]);
    expect(a.counterparty.name).toBe("Jane Customer");
    expect(a.invoiceAmountUsd?.toFixed(2)).toBe("1000.00");
    expect(a.note).toBe("already pre paid");
    expect(a.receiptHref).toBe(
      "/api/accounting/bank-reconciliation/r1/documents/pdf",
    );
    expect(transactionsAgainst(a)).toBe("HS-0042 · Hardware Sales");
    expect(f.id).toBe("br_r1_f");
    expect(f.side).toBe("CREDIT");
    expect(f.amountUsd.toFixed(2)).toBe("5.00");
    expect(f.invoiceType).toBe("Bank Reconciliation Fee");
  });

  it("a 0 amount still makes a $0 Debit row; no fee adds no row", () => {
    const rows = reconciliationStatementRows(
      entry({
        amount: D(0),
        amountUsd: D(0),
        fee: D(0),
        feeUsd: D(0),
        hasPdf: false,
        invoice: {
          id: "inv2",
          invoiceNumber: "INV-1",
          invoiceType: "ELECTRICITY_CHARGES",
          totalAmount: D(500),
        },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].amountUsd.toFixed(2)).toBe("0.00");
    expect(rows[0].invoiceType).toBe("Hosting & Colocation");
    expect(rows[0].invoices[0].href).toBe("/accounting/inv2");
    expect(rows[0].receiptHref).toBeNull();
  });

  it("the bank goes up by amount − fee", () => {
    const s = buildStatement(reconciliationStatementRows(entry()), {});
    expect(s.closingBalanceUsd.toFixed(2)).toBe("995.00");
  });
});

describe("reconciliation list", () => {
  const rows = [
    {
      entryNumber: 1,
      date: "2026-09-10",
      invoiceType: "HARDWARE_SALES",
      invoiceNumber: "HS-1",
      clientName: "B",
      narration: null,
      bankId: "b1",
      bankName: "Faysal",
      amountUsd: "10.00",
      feeUsd: "0.00",
    },
    {
      entryNumber: 2,
      date: "2026-10-01",
      invoiceType: "ELECTRICITY_CHARGES",
      invoiceNumber: "INV-2",
      clientName: "A",
      narration: "x",
      bankId: "b2",
      bankName: "Wise",
      amountUsd: "0.00",
      feeUsd: "1.00",
    },
  ];

  it("filters by type, bank and dates; sorts", () => {
    const all = { invoiceType: "", bankId: "", from: "", to: "" };
    const byDate = { key: "date" as const, dir: "desc" as const };
    expect(
      reconciliationListRows(rows, all, byDate).map((r) => r.entryNumber),
    ).toEqual([2, 1]);
    expect(
      reconciliationListRows(
        rows,
        { ...all, invoiceType: "HARDWARE_SALES" },
        byDate,
      ),
    ).toHaveLength(1);
    expect(
      reconciliationListRows(rows, { ...all, bankId: "b2" }, byDate),
    ).toHaveLength(1);
    expect(
      reconciliationListRows(rows, { ...all, to: "2026-09-30" }, byDate),
    ).toHaveLength(1);
    expect(
      reconciliationListRows(rows, all, { key: "client", dir: "asc" }).map(
        (r) => r.clientName,
      ),
    ).toEqual(["A", "B"]);
  });

  it("query string round-trips", () => {
    const filter = {
      invoiceType: "HARDWARE_REPAIR",
      bankId: "b1",
      from: "2026-01-01",
      to: "2026-02-01",
    };
    const sort = { key: "received" as const, dir: "asc" as const };
    const parsed = parseReconciliationListQuery(
      reconciliationListQuery(filter, sort),
    );
    expect(parsed).toEqual({ filter, sort });
  });
});
