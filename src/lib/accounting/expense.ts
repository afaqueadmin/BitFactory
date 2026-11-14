import { Decimal } from "@prisma/client/runtime/library";
import {
  formatOriginal,
  joinNote,
  SiblingPayment,
  splitNote,
  StatementRow,
} from "@/lib/accounting/bankStatementRows";

/**
 * Pure part of Expenses & Heads (no database): payment amounts, balance and
 * status, the statement rows of one payment, and the head × month report.
 *
 * Rules (decided 2026-11-13):
 * - An expense is owed in USD (amountDueUsd) and can take several payments
 *   until its balance is 0. A payment above the remaining balance is
 *   refused (checked in USD, to cents).
 * - A payment's amount and fee are typed in the bank's currency, with the
 *   rate 1 USD = X currency; USD = amount ÷ rate, fee USD = fee ÷ rate.
 * - The fee doesn't reduce the balance (Balance = Due − Paid); it is a cost
 *   to the bank only, shown as its own "Expense Fee" Credit row.
 * - Every payment is a Credit on the paying bank: amountUsd + feeUsd.
 */

const USD = "USD";
const ZERO = new Decimal(0);

const cents = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const twoDp = (v: Decimal) => v.decimalPlaces() <= 2;

export type ExpenseStatus = "PENDING" | "PARTIAL" | "PAID";

export const expenseStatusLabel = (s: ExpenseStatus): string =>
  s === "PAID" ? "Paid" : s === "PARTIAL" ? "Partially paid" : "Pending";

/** Amount Due − Amount Paid (fees not included). */
export const expenseBalance = (dueUsd: Decimal, paidUsd: Decimal) =>
  dueUsd.minus(paidUsd);

export function expenseStatus(
  dueUsd: Decimal,
  paidUsd: Decimal,
): ExpenseStatus {
  if (paidUsd.greaterThan(0) && !paidUsd.lessThan(dueUsd)) return "PAID";
  return paidUsd.greaterThan(0) ? "PARTIAL" : "PENDING";
}

/** Checks an Amount Due as typed: > 0, up to 2 decimals. */
export function checkAmountDue(due: Decimal | null): string | null {
  if (!due || !due.greaterThan(0) || !twoDp(due)) {
    return "Amount due must be greater than 0 (up to 2 decimals)";
  }
  return null;
}

/** An edit may not lower Amount Due below what has been paid. */
export function checkDueCoversPaid(
  dueUsd: Decimal,
  paidUsd: Decimal,
): string | null {
  return dueUsd.lessThan(paidUsd)
    ? `Amount due can't be less than the $${paidUsd.toFixed(2)} already paid`
    : null;
}

export interface ExpensePaymentAmountsInput {
  /** The bank currency's code. */
  code: string;
  /** In the bank's currency, without the fee. */
  amount: Decimal;
  /** In the bank's currency. */
  fee: Decimal;
  /** 1 USD = rate currency. */
  rate: Decimal;
}

export interface ExpensePaymentAmounts {
  amountUsd: Decimal;
  feeUsd: Decimal;
}

/** Checks one payment's amounts and works out their USD values. */
export function expensePaymentAmounts(
  input: ExpensePaymentAmountsInput,
): ExpensePaymentAmounts | { error: string } {
  const { code, amount, fee, rate } = input;
  if (!amount.greaterThan(0) || !twoDp(amount)) {
    return { error: "Amount paid must be greater than 0 (up to 2 decimals)" };
  }
  if (fee.isNegative() || !twoDp(fee)) {
    return { error: "Fee must be 0 or more (up to 2 decimals)" };
  }
  if (!rate.greaterThan(0) || rate.decimalPlaces() > 8) {
    return {
      error: "Exchange rate must be greater than 0 (up to 8 decimal places)",
    };
  }
  if (code === USD && !rate.equals(1)) {
    return { error: "USD payments must use an exchange rate of 1" };
  }
  const amountUsd = cents(amount.dividedBy(rate));
  if (!amountUsd.greaterThan(0)) {
    return { error: "The payment is worth less than $0.01" };
  }
  return { amountUsd, feeUsd: cents(fee.dividedBy(rate)) };
}

/**
 * A payment may not take the expense past its Amount Due: thisUsd ≤ due −
 * the other payments (on an edit, "other" leaves out the one being edited).
 */
export function checkNotOverpaid({
  dueUsd,
  otherPaidUsd,
  thisUsd,
}: {
  dueUsd: Decimal;
  otherPaidUsd: Decimal;
  thisUsd: Decimal;
}): string | null {
  const remaining = dueUsd.minus(otherPaidUsd);
  if (thisUsd.lessThanOrEqualTo(remaining)) return null;
  return remaining.greaterThan(0)
    ? `This payment ($${thisUsd.toFixed(2)}) is more than the remaining balance of $${remaining.toFixed(2)}`
    : "This expense is already fully paid";
}

/* ------------------------------- Date rules ------------------------------- */
// Days are "YYYY-MM-DD" calendar days (stored as @db.Date, UTC midnight).

/** "YYYY-MM-DD" of a stored calendar day. */
export const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/** "Nov 14, 2026" for a "YYYY-MM-DD" day. */
const dayText = (day: string) =>
  new Date(`${day}T12:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/** Today as "YYYY-MM-DD" in `tz` (UTC when the zone is missing or invalid). */
export function todayIn(tz: unknown, now = new Date()): string {
  const zone = typeof tz === "string" && tz ? tz : "UTC";
  try {
    return now.toLocaleDateString("en-CA", { timeZone: zone });
  } catch {
    return now.toLocaleDateString("en-CA", { timeZone: "UTC" });
  }
}

/** A payment is dated on or after its expense, and not after today. */
export function checkPaymentDate({
  paymentDate,
  expenseDate,
  today,
}: {
  paymentDate: string;
  expenseDate: string;
  today: string;
}): string | null {
  if (paymentDate < expenseDate) {
    return `Payment date can't be before the expense date (${dayText(expenseDate)})`;
  }
  if (paymentDate > today) return "Payment date can't be in the future";
  return null;
}

/** An expense's date can't move after its first payment's date. */
export function checkExpenseDate({
  expenseDate,
  firstPaymentDate,
}: {
  expenseDate: string;
  firstPaymentDate: string | null;
}): string | null {
  return firstPaymentDate && expenseDate > firstPaymentDate
    ? `Date can't be after the first payment (${dayText(firstPaymentDate)})`
    : null;
}

export const expenseHref = (id: string) => `/accounting/expenses?expense=${id}`;

export const expensePaymentReceiptHref = (id: string) =>
  `/api/accounting/expense-payments/${id}/receipt`;

/** A saved payment with what its statement rows show. */
export interface ExpensePaymentForRows {
  id: string;
  date: Date;
  createdAt: Date;
  bankId: string;
  code: string;
  exchangeRate: Decimal;
  amount: Decimal;
  fee: Decimal;
  amountUsd: Decimal;
  feeUsd: Decimal;
  note: string | null;
  hasReceipt: boolean;
  expense: {
    id: string;
    headName: string;
    narration: string | null;
    amountDueUsd: Decimal;
  };
  /** Every payment of the expense, this one included, for the split note. */
  siblings: SiblingPayment[];
}

/**
 * The rows of one expense payment: an "Expense" Credit, plus an "Expense
 * Fee" Credit when the fee is above 0. Ids sort the payment first on a tie.
 */
export function expenseStatementRows(
  p: ExpensePaymentForRows,
  tz: string,
): StatementRow[] {
  // Transactions Against = "Expense" linked to the expense; To/From = head.
  const base = {
    source: "EXPENSE" as const,
    bankId: p.bankId,
    date: p.date,
    recordedAt: p.createdAt,
    invoices: [],
    typeHref: expenseHref(p.expense.id),
    counterparty: { name: p.expense.headName, href: null },
    invoiceAmountUsd: p.expense.amountDueUsd,
    side: "CREDIT" as const,
  };
  const rows: StatementRow[] = [
    {
      ...base,
      id: `ep_${p.id}_a`,
      invoiceType: "Expense",
      amountUsd: p.amountUsd,
      original: formatOriginal(p.amount, p.code, p.exchangeRate),
      partial: p.amountUsd.lessThan(p.expense.amountDueUsd),
      note: joinNote(
        p.expense.narration,
        p.note,
        splitNote({
          thisId: p.id,
          thisAmountUsd: p.amountUsd,
          invoiceTotalUsd: p.expense.amountDueUsd,
          payments: p.siblings,
          withOutstanding: true,
          tz,
        }),
      ),
      receiptHref: p.hasReceipt ? expensePaymentReceiptHref(p.id) : null,
    },
  ];
  if (p.fee.greaterThan(0)) {
    rows.push({
      ...base,
      id: `ep_${p.id}_f`,
      invoiceType: "Expense Fee",
      amountUsd: p.feeUsd,
      original: formatOriginal(p.fee, p.code, p.exchangeRate),
      partial: false,
      note: "Bank fee on the expense payment",
      receiptHref: null,
    });
  }
  return rows;
}

/* ---------------------------- Head × month report --------------------------- */

export interface ReportCell {
  dueUsd: Decimal;
  paidUsd: Decimal;
  balanceUsd: Decimal;
  feesUsd: Decimal;
}

export interface ExpenseReport {
  /** "YYYY-MM", oldest first. */
  months: string[];
  rows: {
    head: string;
    cells: Record<string, ReportCell>;
    total: ReportCell;
  }[];
  /** Per month, across every head. */
  totals: Record<string, ReportCell>;
  grandTotal: ReportCell;
}

const emptyCell = (): ReportCell => ({
  dueUsd: ZERO,
  paidUsd: ZERO,
  balanceUsd: ZERO,
  feesUsd: ZERO,
});

const addCell = (c: ReportCell, part: Partial<ReportCell>): ReportCell => {
  const dueUsd = c.dueUsd.plus(part.dueUsd ?? ZERO);
  const paidUsd = c.paidUsd.plus(part.paidUsd ?? ZERO);
  return {
    dueUsd,
    paidUsd,
    balanceUsd: dueUsd.minus(paidUsd),
    feesUsd: c.feesUsd.plus(part.feesUsd ?? ZERO),
  };
};

/** "YYYY-MM" of a @db.Date (stored at UTC midnight). */
export const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/**
 * Totals per head and month. An expense counts in the month of its date
 * (Due, its Paid and Balance); fees count in the month they were paid.
 */
export function buildExpenseReport(
  expenses: { date: Date; head: string; dueUsd: Decimal; paidUsd: Decimal }[],
  fees: { date: Date; head: string; feeUsd: Decimal }[],
): ExpenseReport {
  const byHead = new Map<string, Record<string, ReportCell>>();
  const months = new Set<string>();
  const add = (head: string, month: string, part: Partial<ReportCell>) => {
    months.add(month);
    const cells = byHead.get(head) ?? {};
    cells[month] = addCell(cells[month] ?? emptyCell(), part);
    byHead.set(head, cells);
  };
  for (const e of expenses) {
    add(e.head, monthKey(e.date), { dueUsd: e.dueUsd, paidUsd: e.paidUsd });
  }
  for (const f of fees) {
    if (f.feeUsd.greaterThan(0)) {
      add(f.head, monthKey(f.date), { feesUsd: f.feeUsd });
    }
  }

  const sortedMonths = [...months].sort();
  const totals: Record<string, ReportCell> = {};
  let grandTotal = emptyCell();
  const rows = [...byHead.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([head, cells]) => {
      let total = emptyCell();
      for (const [month, cell] of Object.entries(cells)) {
        total = addCell(total, cell);
        totals[month] = addCell(totals[month] ?? emptyCell(), cell);
      }
      grandTotal = addCell(grandTotal, total);
      return { head, cells, total };
    });
  return { months: sortedMonths, rows, totals, grandTotal };
}
