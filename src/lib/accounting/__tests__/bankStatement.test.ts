import { describe, expect, it } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  buildStatement,
  byBankSummary,
  customerInvoiceHref,
  customerPaymentTypeLabel,
  feeUsd,
  floatUsd,
  formatOriginal,
  joinNote,
  splitNote,
  StatementRow,
} from "../bankStatementRows";

const D = (v: number | string) => new Decimal(v);

const row = (
  id: string,
  date: string,
  side: "DEBIT" | "CREDIT",
  amount: number,
  recordedAt = date,
  bankId = "bank1",
): StatementRow => ({
  id,
  source: side === "DEBIT" ? "COST_PAYMENT" : "VENDOR_PART",
  bankId,
  date: new Date(date),
  recordedAt: new Date(recordedAt),
  invoices: [],
  invoiceType: "",
  counterparty: { name: "", href: null },
  invoiceAmountUsd: null,
  side,
  amountUsd: D(amount),
  original: null,
  partial: false,
  note: "",
  receiptHref: null,
});

describe("buildStatement", () => {
  const rows = [
    row("c", "2026-11-10T00:00:00Z", "CREDIT", 10000),
    row("a", "2026-10-20T00:00:00Z", "DEBIT", 20000),
    row("b", "2026-11-03T00:00:00Z", "DEBIT", 6000),
    row("d", "2026-11-15T00:00:00Z", "DEBIT", 180),
    row("e", "2026-12-01T00:00:00Z", "CREDIT", 50),
  ];

  it("sorts oldest first with a running balance from zero", () => {
    const s = buildStatement(rows);
    expect(s.rows.map((r) => r.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(s.rows.map((r) => r.balanceUsd.toFixed(2))).toEqual([
      "20000.00",
      "26000.00",
      "16000.00",
      "16180.00",
      "16130.00",
    ]);
    expect(s.openingBalanceUsd.toFixed(2)).toBe("0.00");
    expect(s.closingBalanceUsd.toFixed(2)).toBe("16130.00");
    expect(s.totals.debitUsd.toFixed(2)).toBe("26180.00");
    expect(s.totals.creditUsd.toFixed(2)).toBe("10050.00");
  });

  it("carries an opening balance into a date range", () => {
    const s = buildStatement(rows, {
      from: new Date("2026-11-01T00:00:00Z"),
      toExclusive: new Date("2026-12-01T00:00:00Z"),
    });
    expect(s.openingBalanceUsd.toFixed(2)).toBe("20000.00");
    expect(s.rows.map((r) => r.id)).toEqual(["b", "c", "d"]);
    expect(s.rows[0].balanceUsd.toFixed(2)).toBe("26000.00");
    expect(s.closingBalanceUsd.toFixed(2)).toBe("16180.00");
    expect(s.totals.debitUsd.toFixed(2)).toBe("6180.00");
    expect(s.totals.creditUsd.toFixed(2)).toBe("10000.00");
    // opening + debits - credits = closing
    expect(
      s.openingBalanceUsd
        .plus(s.totals.debitUsd)
        .minus(s.totals.creditUsd)
        .toFixed(2),
    ).toBe(s.closingBalanceUsd.toFixed(2));
  });

  it("closes at the opening balance when the range is empty", () => {
    const s = buildStatement(rows, {
      from: new Date("2026-11-20T00:00:00Z"),
      toExclusive: new Date("2026-11-25T00:00:00Z"),
    });
    expect(s.rows).toHaveLength(0);
    expect(s.closingBalanceUsd.toFixed(2)).toBe("16180.00");
  });

  it("orders same-day rows by when they were recorded, then id", () => {
    const day = "2026-11-05T00:00:00Z";
    const s = buildStatement([
      row("z", day, "DEBIT", 1, "2026-11-05T10:00:00Z"),
      row("y", day, "DEBIT", 1, "2026-11-05T09:00:00Z"),
      row("x", day, "DEBIT", 1, "2026-11-05T10:00:00Z"),
    ]);
    expect(s.rows.map((r) => r.id)).toEqual(["y", "x", "z"]);
  });
});

describe("byBankSummary", () => {
  const rows = [
    row("a", "2026-10-20T00:00:00Z", "DEBIT", 20000, undefined, "wise"),
    row("b", "2026-11-03T00:00:00Z", "DEBIT", 6000, undefined, "binance"),
    row("c", "2026-11-10T00:00:00Z", "CREDIT", 10000, undefined, "wise"),
    row("d", "2026-11-15T00:00:00Z", "CREDIT", 500, undefined, "binance"),
    row("e", "2026-12-01T00:00:00Z", "DEBIT", 50, undefined, "wise"),
    row("x", "2026-11-05T00:00:00Z", "DEBIT", 999, undefined, "other"),
  ];
  const range = {
    from: new Date("2026-11-01T00:00:00Z"),
    toExclusive: new Date("2026-12-01T00:00:00Z"),
  };
  const fixed = (s: ReturnType<typeof byBankSummary>[number]) => ({
    bankId: s.bankId,
    opening: s.openingBalanceUsd.toFixed(2),
    debit: s.debitUsd.toFixed(2),
    credit: s.creditUsd.toFixed(2),
    closing: s.closingBalanceUsd.toFixed(2),
  });

  it("splits the range per bank, in the given order, zeros for no rows", () => {
    expect(
      byBankSummary(rows, ["wise", "binance", "empty"], range).map(fixed),
    ).toEqual([
      {
        bankId: "wise",
        opening: "20000.00",
        debit: "0.00",
        credit: "10000.00",
        closing: "10000.00",
      },
      {
        bankId: "binance",
        opening: "0.00",
        debit: "6000.00",
        credit: "500.00",
        closing: "5500.00",
      },
      {
        bankId: "empty",
        opening: "0.00",
        debit: "0.00",
        credit: "0.00",
        closing: "0.00",
      },
    ]);
  });

  it("adds up to the consolidated statement of the same banks", () => {
    const ids = ["wise", "binance"];
    const mine = rows.filter((r) => ids.includes(r.bankId));
    const s = buildStatement(mine, range);
    const lines = byBankSummary(mine, ids, range);
    const sum = (f: (b: (typeof lines)[number]) => Decimal) =>
      lines.reduce((t, b) => t.plus(f(b)), D(0)).toFixed(2);
    expect(sum((b) => b.openingBalanceUsd)).toBe(
      s.openingBalanceUsd.toFixed(2),
    );
    expect(sum((b) => b.debitUsd)).toBe(s.totals.debitUsd.toFixed(2));
    expect(sum((b) => b.creditUsd)).toBe(s.totals.creditUsd.toFixed(2));
    expect(sum((b) => b.closingBalanceUsd)).toBe(
      s.closingBalanceUsd.toFixed(2),
    );
    // One running balance across both banks, oldest first.
    expect(s.rows.map((r) => r.id)).toEqual(["b", "c", "d"]);
    expect(s.rows.map((r) => r.balanceUsd.toFixed(2))).toEqual([
      "26000.00",
      "16000.00",
      "15500.00",
    ]);
  });
});

describe("customer payment labels and links", () => {
  it("labels each payment section", () => {
    expect(customerPaymentTypeLabel("HARDWARE_SALES", "HARDWARE_SALES")).toBe(
      "Hardware Sales",
    );
    expect(customerPaymentTypeLabel("HARDWARE_REPAIR", "HARDWARE_REPAIR")).toBe(
      "Hardware Repair",
    );
    expect(customerPaymentTypeLabel("PAYMENT", "ELECTRICITY_CHARGES")).toBe(
      "Hosting & Colocation",
    );
    // Hosting section of a Hardware Sales invoice.
    expect(customerPaymentTypeLabel("PAYMENT", "HARDWARE_SALES")).toBe(
      "Hosting & Colocation",
    );
    expect(customerPaymentTypeLabel("PAYMENT", "HARDWARE_PURCHASE")).toBe(
      "Hardware Procurement",
    );
    expect(customerPaymentTypeLabel("ADJUSTMENT", null)).toBe("Adjustment");
  });

  it("links to each invoice page", () => {
    expect(customerInvoiceHref("HARDWARE_SALES", "i1")).toBe(
      "/accounting/hardware-sales/i1",
    );
    expect(customerInvoiceHref("HARDWARE_REPAIR", "i1")).toBe(
      "/accounting/hardware-repair/i1",
    );
    expect(customerInvoiceHref("ELECTRICITY_CHARGES", "i1")).toBe(
      "/accounting/i1",
    );
  });
});

describe("splitNote", () => {
  const tz = "UTC";
  const pay = (id: string, amount: number, via: string, date: string) => ({
    id,
    amountUsd: D(amount),
    via,
    date: new Date(date),
  });

  it("is empty when only this payment paid the invoice", () => {
    expect(
      splitNote({
        thisId: "a",
        thisAmountUsd: D(10000),
        invoiceTotalUsd: D(10000),
        payments: [pay("a", 10000, "Bank A", "2026-11-03T00:00:00Z")],
        withOutstanding: true,
        tz,
      }),
    ).toBe("");
  });

  it("names the other banks and what is still outstanding", () => {
    const note = splitNote({
      thisId: "a",
      thisAmountUsd: D(6000),
      invoiceTotalUsd: D(10000),
      payments: [
        pay("c", 1000, "Bank A", "2026-11-07T00:00:00Z"),
        pay("a", 6000, "Bank A", "2026-11-03T00:00:00Z"),
        pay("b", 2000, "Bank B", "2026-11-05T00:00:00Z"),
      ],
      withOutstanding: true,
      tz,
    });
    expect(note).toBe(
      "Partial: $6,000.00 of $10,000.00 · also $2,000.00 via Bank B (Nov 5, 2026), $1,000.00 via Bank A (Nov 7, 2026) · outstanding $1,000.00",
    );
  });

  it("drops 'Partial' when the row covers the invoice and flags an overpayment", () => {
    // Hardware section recorded at the full total plus a hosting payment.
    const note = splitNote({
      thisId: "hw",
      thisAmountUsd: D(4644),
      invoiceTotalUsd: D(4644),
      payments: [
        pay("hw", 4644, "Faysal Bank", "2026-10-13T00:00:00Z"),
        pay("ho", 1194, "Faysal Bank", "2026-10-13T00:00:00Z"),
      ],
      withOutstanding: true,
      tz,
    });
    expect(note).toBe(
      "$4,644.00 of $4,644.00 · also $1,194.00 via Faysal Bank (Oct 13, 2026) · overpaid $1,194.00",
    );
  });

  it("shows outstanding and leaves it out for vendor invoices", () => {
    const payments = [
      pay("a", 6000, "Bank A", "2026-11-03T00:00:00Z"),
      pay("b", 4000, "Bank B", "2026-11-03T00:00:00Z"),
    ];
    const args = {
      thisId: "a",
      thisAmountUsd: D(6000),
      invoiceTotalUsd: D(10000),
      payments,
      tz,
    };
    expect(splitNote({ ...args, withOutstanding: true })).toMatch(
      /outstanding \$0\.00$/,
    );
    expect(splitNote({ ...args, withOutstanding: false })).not.toMatch(
      /outstanding/,
    );
  });
});

describe("amount helpers", () => {
  it("rounds Float customer amounts to cents before summing", () => {
    expect(floatUsd(0.1).plus(floatUsd(0.2)).toFixed(2)).toBe("0.30");
    expect(floatUsd(1234.565).toFixed(2)).toBe("1234.57");
  });

  it("converts a fee to USD at its rate", () => {
    expect(feeUsd(D("73.45"), D("3.6725")).toFixed(2)).toBe("20.00");
    expect(feeUsd(D(5), D(0)).toFixed(2)).toBe("0.00");
  });

  it("formats the original amount with the rate for non-USD", () => {
    expect(formatOriginal(D("3670"), "AED", D("3.67"))).toBe(
      "3,670.00 AED @ 3.67",
    );
    expect(formatOriginal(D("6000"), "USD", D(1))).toBe("6,000.00 USD");
    expect(formatOriginal(null, "USD", D(1))).toBeNull();
    expect(formatOriginal(D(1), null, D(1))).toBeNull();
  });

  it("joins only the non-empty note parts", () => {
    expect(joinNote("Binance tx", "", null, "incl. $20.00 fee")).toBe(
      "Binance tx · incl. $20.00 fee",
    );
  });
});
