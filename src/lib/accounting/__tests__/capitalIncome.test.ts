import { describe, expect, it } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  buildIncomeReport,
  checkIncomeDate,
  incomeAmounts,
  incomeEntryLabel,
  IncomeForRows,
  incomeStatementRows,
} from "../capitalIncome";
import { buildStatement, transactionsAgainst } from "../bankStatementRows";
import {
  incomeListQuery,
  incomeListRows,
  parseIncomeListQuery,
} from "../capitalIncomeLists";

const D = (v: number | string) => new Decimal(v);

const ok = (r: ReturnType<typeof incomeAmounts>) => {
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("incomeAmounts", () => {
  it("bank currency ÷ rate, to cents, for the amount and the fee", () => {
    const r = ok(
      incomeAmounts({
        code: "PKR",
        amount: D("280000"),
        fee: D("1400"),
        rate: D("280"),
      }),
    );
    expect(r.amountUsd.toFixed(2)).toBe("1000.00");
    expect(r.feeUsd.toFixed(2)).toBe("5.00");
  });

  it("USD at a rate of 1; rounds half up", () => {
    const r = ok(
      incomeAmounts({ code: "AED", amount: D("10"), fee: D(0), rate: D(3) }),
    );
    expect(r.amountUsd.toFixed(2)).toBe("3.33");
    expect(
      ok(
        incomeAmounts({ code: "USD", amount: D(50), fee: D(0), rate: D(1) }),
      ).amountUsd.toFixed(2),
    ).toBe("50.00");
  });

  it("refuses bad input", () => {
    const base = { code: "AED", amount: D(10), fee: D(0), rate: D(3.67) };
    expect("error" in incomeAmounts({ ...base, amount: D(0) })).toBe(true);
    expect("error" in incomeAmounts({ ...base, amount: D("1.001") })).toBe(
      true,
    );
    expect("error" in incomeAmounts({ ...base, fee: D(-1) })).toBe(true);
    expect("error" in incomeAmounts({ ...base, rate: D(0) })).toBe(true);
    expect("error" in incomeAmounts({ ...base, rate: D("1.123456789") })).toBe(
      true,
    );
    expect("error" in incomeAmounts({ ...base, code: "USD", rate: D(2) })).toBe(
      true,
    );
    expect(
      "error" in incomeAmounts({ ...base, amount: D("0.01"), rate: D(1000) }),
    ).toBe(true);
  });
});

describe("checkIncomeDate", () => {
  it("today or earlier only", () => {
    expect(checkIncomeDate({ date: "2026-11-16", today: "2026-11-16" })).toBe(
      null,
    );
    expect(checkIncomeDate({ date: "2025-01-01", today: "2026-11-16" })).toBe(
      null,
    );
    expect(
      checkIncomeDate({ date: "2026-11-17", today: "2026-11-16" }),
    ).toMatch(/future/);
  });
});

const entry = (over: Partial<IncomeForRows> = {}): IncomeForRows => ({
  id: "i1",
  entryNumber: 1,
  date: new Date("2026-11-01T00:00:00.000Z"),
  createdAt: new Date("2026-11-01T09:00:00.000Z"),
  bankId: "b1",
  code: "PKR",
  exchangeRate: D(280),
  amount: D(280000),
  fee: D(1400),
  amountUsd: D(1000),
  feeUsd: D(5),
  headName: "Equity",
  receivedFrom: "Ali Khan",
  narration: "Share capital",
  hasPdf: true,
  ...over,
});

describe("incomeStatementRows", () => {
  it("a Debit plus a separate fee Credit, both against CAP-0001", () => {
    const rows = incomeStatementRows(entry());
    expect(
      rows.map((r) => [r.id, r.invoiceType, r.side, r.amountUsd.toFixed(2)]),
    ).toEqual([
      ["ci_i1_a", "Capital & Income", "DEBIT", "1000.00"],
      ["ci_i1_f", "Capital & Income Fee", "CREDIT", "5.00"],
    ]);
    expect(rows[0].source).toBe("INCOME");
    const against = [
      { number: "CAP-0001", href: "/accounting/capital-income?entry=i1" },
    ];
    expect(rows.map((r) => r.invoices)).toEqual([against, against]);
    expect(transactionsAgainst(rows[0])).toBe("CAP-0001 · Capital & Income");
    expect(rows[0].counterparty).toEqual({ name: "Ali Khan", href: null });
    expect(rows[0].invoiceAmountUsd).toBeNull();
    expect(rows[0].original).toBe("280,000.00 PKR @ 280");
    expect(rows[1].original).toBe("1,400.00 PKR @ 280");
    expect(rows[0].note).toBe("Share capital");
    expect(rows[0].receiptHref).toBe(
      "/api/accounting/capital-income/i1/documents/pdf",
    );
    expect(rows[1].receiptHref).toBeNull();
    expect(rows.every((r) => !r.partial)).toBe(true);
  });

  it("no fee row at 0; To/From falls back to the head; no PDF, no receipt", () => {
    const rows = incomeStatementRows(
      entry({
        fee: D(0),
        feeUsd: D(0),
        receivedFrom: "  ",
        hasPdf: false,
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].counterparty.name).toBe("Equity");
    expect(rows[0].receiptHref).toBeNull();
  });

  it("an opening deposit gives the bank a positive running balance", () => {
    const st = buildStatement(incomeStatementRows(entry()));
    expect(st.rows.map((r) => r.balanceUsd.toFixed(2))).toEqual([
      "1000.00",
      "995.00",
    ]);
    expect(st.totals.debitUsd.toFixed(2)).toBe("1000.00");
    expect(st.totals.creditUsd.toFixed(2)).toBe("5.00");
    expect(st.closingBalanceUsd.toFixed(2)).toBe("995.00");
  });

  it("entry labels", () => {
    expect(incomeEntryLabel(1)).toBe("CAP-0001");
    expect(incomeEntryLabel(12345)).toBe("CAP-12345");
  });
});

describe("buildIncomeReport", () => {
  it("sums received and fees per head and month", () => {
    const r = buildIncomeReport([
      {
        date: new Date("2026-10-05"),
        head: "Equity",
        amountUsd: D(1000),
        feeUsd: D(5),
      },
      {
        date: new Date("2026-10-20"),
        head: "Equity",
        amountUsd: D(500),
        feeUsd: D(0),
      },
      {
        date: new Date("2026-11-02"),
        head: "Loan",
        amountUsd: D(200),
        feeUsd: D(1),
      },
    ]);
    expect(r.months).toEqual(["2026-10", "2026-11"]);
    expect(r.rows.map((x) => x.head)).toEqual(["Equity", "Loan"]);
    expect(r.rows[0].cells["2026-10"].receivedUsd.toFixed(2)).toBe("1500.00");
    expect(r.rows[0].total.feesUsd.toFixed(2)).toBe("5.00");
    expect(r.totals["2026-11"].receivedUsd.toFixed(2)).toBe("200.00");
    expect(r.grandTotal.receivedUsd.toFixed(2)).toBe("1700.00");
    expect(r.grandTotal.feesUsd.toFixed(2)).toBe("6.00");
  });
});

describe("incomeListRows", () => {
  const row = (n: number, date: string, head: string, bankId: string) => ({
    entryNumber: n,
    date,
    head: { id: head, name: head },
    receivedFrom: null,
    narration: null,
    bankId,
    bankName: bankId,
    amountUsd: String(n * 100),
    feeUsd: "0.00",
  });
  const rows = [
    row(1, "2026-10-01", "Equity", "b1"),
    row(2, "2026-11-01", "Loan", "b2"),
    row(3, "2026-11-10", "Equity", "b2"),
  ];

  it("filters by head, bank and dates, then sorts", () => {
    const sort = { key: "date" as const, dir: "desc" as const };
    expect(
      incomeListRows(
        rows,
        { headId: "Equity", bankId: "", from: "", to: "" },
        sort,
      ).map((r) => r.entryNumber),
    ).toEqual([3, 1]);
    expect(
      incomeListRows(
        rows,
        { headId: "", bankId: "b2", from: "2026-11-05", to: "" },
        sort,
      ).map((r) => r.entryNumber),
    ).toEqual([3]);
  });

  it("the export query round-trips", () => {
    const filter = {
      headId: "h",
      bankId: "b",
      from: "2026-01-01",
      to: "2026-02-01",
    };
    const sort = { key: "received" as const, dir: "asc" as const };
    expect(parseIncomeListQuery(incomeListQuery(filter, sort))).toEqual({
      filter,
      sort,
    });
  });
});
