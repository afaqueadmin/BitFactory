import { describe, expect, it } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  buildExpenseReport,
  checkAmountDue,
  checkDueCoversPaid,
  checkExpenseDate,
  checkNotOverpaid,
  checkPaymentDate,
  expenseEntryLabel,
  todayIn,
  ExpensePaymentForRows,
  expensePaymentAmounts,
  expenseStatementRows,
  expenseStatus,
} from "../expense";
import { buildStatement, transactionsAgainst } from "../bankStatementRows";

const D = (v: number | string) => new Decimal(v);
const TZ = "UTC";

const ok = (r: ReturnType<typeof expensePaymentAmounts>) => {
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("expensePaymentAmounts", () => {
  it("bank currency ÷ rate, to cents, for the amount and the fee", () => {
    const r = ok(
      expensePaymentAmounts({
        code: "AED",
        amount: D("367.25"),
        fee: D("18.36"),
        rate: D("3.6725"),
      }),
    );
    expect(r.amountUsd.toFixed(2)).toBe("100.00");
    expect(r.feeUsd.toFixed(2)).toBe("5.00");
  });

  it("USD at rate 1; a blank fee is 0", () => {
    const r = ok(
      expensePaymentAmounts({
        code: "USD",
        amount: D(50),
        fee: D(0),
        rate: D(1),
      }),
    );
    expect(r.amountUsd.toFixed(2)).toBe("50.00");
    expect(r.feeUsd.toFixed(2)).toBe("0.00");
  });

  it("refuses USD at another rate, bad decimals and tiny amounts", () => {
    const base = { code: "AED", amount: D(10), fee: D(0), rate: D(1) };
    expect(
      "error" in expensePaymentAmounts({ ...base, code: "USD", rate: D(2) }),
    ).toBe(true);
    expect(
      "error" in expensePaymentAmounts({ ...base, amount: D("1.001") }),
    ).toBe(true);
    expect("error" in expensePaymentAmounts({ ...base, fee: D(-1) })).toBe(
      true,
    );
    expect(
      "error" in expensePaymentAmounts({ ...base, rate: D("1.123456789") }),
    ).toBe(true);
    expect(
      "error" in
        expensePaymentAmounts({ ...base, amount: D("0.01"), rate: D(1000) }),
    ).toBe(true);
  });
});

describe("balance, status and limits", () => {
  it("status follows what was paid (fees don't count)", () => {
    expect(expenseStatus(D(100), D(0))).toBe("PENDING");
    expect(expenseStatus(D(100), D("99.99"))).toBe("PARTIAL");
    expect(expenseStatus(D(100), D(100))).toBe("PAID");
  });

  it("blocks a payment above the remaining balance", () => {
    expect(
      checkNotOverpaid({ dueUsd: D(100), otherPaidUsd: D(60), thisUsd: D(40) }),
    ).toBeNull();
    expect(
      checkNotOverpaid({
        dueUsd: D(100),
        otherPaidUsd: D(60),
        thisUsd: D("40.01"),
      }),
    ).toMatch(/remaining balance of \$40\.00/);
    expect(
      checkNotOverpaid({ dueUsd: D(100), otherPaidUsd: D(100), thisUsd: D(1) }),
    ).toMatch(/already fully paid/);
  });

  it("Amount Due must be > 0 with 2 decimals, and cover what was paid", () => {
    expect(checkAmountDue(D(10))).toBeNull();
    expect(checkAmountDue(D("10.005"))).not.toBeNull();
    expect(checkAmountDue(null)).not.toBeNull();
    expect(checkDueCoversPaid(D(50), D(60))).toMatch(/\$60\.00 already paid/);
    expect(checkDueCoversPaid(D(60), D(60))).toBeNull();
  });
});

const payment = (
  over: Partial<ExpensePaymentForRows> = {},
): ExpensePaymentForRows => ({
  id: "p1",
  date: new Date("2026-11-10T00:00:00Z"),
  createdAt: new Date("2026-11-10T09:00:00Z"),
  bankId: "bankA",
  code: "AED",
  exchangeRate: D("3.6725"),
  amount: D("367.25"),
  fee: D("18.36"),
  amountUsd: D(100),
  feeUsd: D(5),
  note: "ref 42",
  hasReceipt: true,
  expense: {
    id: "e1",
    entryNumber: 1,
    headName: "Fuel",
    narration: "Generator diesel",
    amountDueUsd: D(250),
  },
  siblings: [
    {
      id: "p1",
      amountUsd: D(100),
      via: "Bank A",
      date: new Date("2026-11-10"),
    },
  ],
  ...over,
});

describe("expenseStatementRows", () => {
  it("an Expense Credit plus a separate Expense Fee Credit", () => {
    const rows = expenseStatementRows(payment(), TZ);
    expect(
      rows.map((r) => [r.id, r.invoiceType, r.side, r.amountUsd.toFixed(2)]),
    ).toEqual([
      ["ep_p1_a", "Expense", "CREDIT", "100.00"],
      ["ep_p1_f", "Expense Fee", "CREDIT", "5.00"],
    ]);
    expect(rows[0].source).toBe("EXPENSE");
    expect(rows[0].counterparty).toEqual({ name: "Fuel", href: null });
    // Transactions Against: the entry, linked to the expense, on both rows.
    const entry = [
      { number: "EXP-0001", href: "/accounting/expenses?expense=e1" },
    ];
    expect(rows.map((r) => r.invoices)).toEqual([entry, entry]);
    expect(transactionsAgainst(rows[0])).toBe("EXP-0001 · Expense");
    expect(transactionsAgainst(rows[1])).toBe("EXP-0001 · Expense Fee");
    expect(expenseEntryLabel(1)).toBe("EXP-0001");
    expect(expenseEntryLabel(12345)).toBe("EXP-12345");
    expect(
      transactionsAgainst({
        invoices: [
          { number: "1151", href: "" },
          { number: "1153", href: "" },
        ],
        invoiceType: "Farm Tariff",
      }),
    ).toBe("1151, 1153 · Farm Tariff");
    expect(rows[0].original).toBe("367.25 AED @ 3.6725");
    expect(rows[0].partial).toBe(true);
    expect(rows[0].note).toBe("Generator diesel · ref 42");
    expect(rows[0].receiptHref).toBe(
      "/api/accounting/expense-payments/p1/receipt",
    );
    expect(rows[1].receiptHref).toBeNull();
  });

  it("no fee row when the fee is 0; split note lists the other payment", () => {
    const rows = expenseStatementRows(
      payment({
        fee: D(0),
        feeUsd: D(0),
        siblings: [
          {
            id: "p1",
            amountUsd: D(100),
            via: "Bank A",
            date: new Date("2026-11-10"),
          },
          {
            id: "p2",
            amountUsd: D(150),
            via: "Wise",
            date: new Date("2026-11-12"),
          },
        ],
      }),
      TZ,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toContain(
      "Partial: $100.00 of $250.00 · also $150.00 via Wise",
    );
    expect(rows[0].note).toContain("outstanding $0.00");
  });

  it("the bank loses amount + fee on the statement", () => {
    const s = buildStatement(expenseStatementRows(payment(), TZ));
    expect(s.totals.creditUsd.toFixed(2)).toBe("105.00");
    expect(s.closingBalanceUsd.toFixed(2)).toBe("-105.00");
  });
});

describe("buildExpenseReport", () => {
  it("totals per head and month; fees in the month paid", () => {
    const r = buildExpenseReport(
      [
        {
          date: new Date("2026-10-05"),
          head: "Salary",
          dueUsd: D(1000),
          paidUsd: D(1000),
        },
        {
          date: new Date("2026-11-01"),
          head: "Salary",
          dueUsd: D(1000),
          paidUsd: D(400),
        },
        {
          date: new Date("2026-11-03"),
          head: "Fuel",
          dueUsd: D(200),
          paidUsd: D(0),
        },
      ],
      [
        { date: new Date("2026-11-02"), head: "Salary", feeUsd: D(5) },
        { date: new Date("2026-11-02"), head: "Fuel", feeUsd: D(0) },
      ],
    );
    expect(r.months).toEqual(["2026-10", "2026-11"]);
    expect(r.rows.map((x) => x.head)).toEqual(["Fuel", "Salary"]);
    const salary = r.rows[1];
    expect(salary.cells["2026-11"].balanceUsd.toFixed(2)).toBe("600.00");
    expect(salary.cells["2026-11"].feesUsd.toFixed(2)).toBe("5.00");
    expect(salary.total.dueUsd.toFixed(2)).toBe("2000.00");
    expect(r.totals["2026-11"].dueUsd.toFixed(2)).toBe("1200.00");
    expect(r.grandTotal.balanceUsd.toFixed(2)).toBe("800.00");
    expect(r.grandTotal.feesUsd.toFixed(2)).toBe("5.00");
  });
});

describe("expense date rules", () => {
  const rule = (paymentDate: string) =>
    checkPaymentDate({
      paymentDate,
      expenseDate: "2026-11-10",
      today: "2026-11-14",
    });

  it("a payment is dated from the expense date to today", () => {
    expect(rule("2026-11-10")).toBeNull();
    expect(rule("2026-11-14")).toBeNull();
    expect(rule("2026-11-09")).toBe(
      "Payment date can't be before the expense date (Nov 10, 2026)",
    );
    expect(rule("2026-11-15")).toBe("Payment date can't be in the future");
  });

  it("an expense date can't move after its first payment", () => {
    const check = (expenseDate: string, first: string | null) =>
      checkExpenseDate({ expenseDate, firstPaymentDate: first });
    expect(check("2026-11-12", "2026-11-12")).toBeNull();
    expect(check("2026-11-01", "2026-11-12")).toBeNull();
    expect(check("2026-12-01", null)).toBeNull();
    expect(check("2026-11-13", "2026-11-12")).toBe(
      "Date can't be after the first payment (Nov 12, 2026)",
    );
  });

  it("today follows the browser's time zone", () => {
    // 21:00 UTC on Nov 14 is already Nov 15 in Karachi (UTC+5).
    const now = new Date("2026-11-14T21:00:00Z");
    expect(todayIn("Asia/Karachi", now)).toBe("2026-11-15");
    expect(todayIn("UTC", now)).toBe("2026-11-14");
    expect(todayIn(undefined, now)).toBe("2026-11-14");
    expect(todayIn("Not/AZone", now)).toBe("2026-11-14");
  });
});
