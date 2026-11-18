import { Decimal } from "@prisma/client/runtime/library";
import {
  formatOriginal,
  StatementRow,
} from "@/lib/accounting/bankStatementRows";

/**
 * Pure part of Capital & Income (no database): amounts, the date rule, the
 * statement rows of one entry and the head × month report.
 *
 * Rules (decided 2026-11-16):
 * - One step: each entry is money received into one bank (initial deposit,
 *   equity, loan, ...), with no Amount Due and no status.
 * - Amount and fee are typed in the bank's currency, with the rate 1 USD =
 *   X currency; USD = amount ÷ rate, fee USD = fee ÷ rate (to cents).
 * - Always a Debit of amountUsd on the bank, plus its own "Capital & Income
 *   Fee" Credit row of feeUsd when the fee is above 0.
 * - The date can't be in the future (the viewer's day).
 */

const USD = "USD";
const ZERO = new Decimal(0);

const cents = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const twoDp = (v: Decimal) => v.decimalPlaces() <= 2;

export const INCOME_TYPE_LABEL = "Capital & Income";
export const INCOME_FEE_LABEL = "Capital & Income Fee";

export interface IncomeAmountsInput {
  /** The bank currency's code. */
  code: string;
  /** In the bank's currency, before the fee. */
  amount: Decimal;
  /** In the bank's currency. */
  fee: Decimal;
  /** 1 USD = rate currency. */
  rate: Decimal;
}

export interface IncomeAmounts {
  amountUsd: Decimal;
  feeUsd: Decimal;
}

/** Checks one entry's amounts and works out their USD values. */
export function incomeAmounts(
  input: IncomeAmountsInput,
): IncomeAmounts | { error: string } {
  const { code, amount, fee, rate } = input;
  if (!amount.greaterThan(0) || !twoDp(amount)) {
    return {
      error: "Amount received must be greater than 0 (up to 2 decimals)",
    };
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
    return { error: "USD amounts must use an exchange rate of 1" };
  }
  const amountUsd = cents(amount.dividedBy(rate));
  if (!amountUsd.greaterThan(0)) {
    return { error: "The amount is worth less than $0.01" };
  }
  return { amountUsd, feeUsd: cents(fee.dividedBy(rate)) };
}

/** An entry is dated today or earlier ("YYYY-MM-DD" calendar days). */
export function checkIncomeDate({
  date,
  today,
}: {
  date: string;
  today: string;
}): string | null {
  return date > today ? "Date can't be in the future" : null;
}

/** Entry # as shown: "CAP-0001" (4 digits at least). */
export const incomeEntryLabel = (entryNumber: number) =>
  `CAP-${String(entryNumber).padStart(4, "0")}`;

export const incomeHref = (id: string) =>
  `/accounting/capital-income?entry=${id}`;

export const incomeDocumentHref = (id: string, kind: "pdf" | "sheet") =>
  `/api/accounting/capital-income/${id}/documents/${kind}`;

/** A saved entry with what its statement rows show. */
export interface IncomeForRows {
  id: string;
  entryNumber: number;
  date: Date;
  createdAt: Date;
  bankId: string;
  code: string;
  exchangeRate: Decimal;
  amount: Decimal;
  fee: Decimal;
  amountUsd: Decimal;
  feeUsd: Decimal;
  headName: string;
  receivedFrom: string | null;
  narration: string | null;
  hasPdf: boolean;
}

/**
 * The rows of one entry: a "Capital & Income" Debit, plus a "Capital &
 * Income Fee" Credit when the fee is above 0. Transactions Against = the
 * entry (CAP-0001, linked) with the type under it; To/From = Received from,
 * else the head. Ids sort the amount first on a tie.
 */
export function incomeStatementRows(e: IncomeForRows): StatementRow[] {
  const base = {
    source: "INCOME" as const,
    bankId: e.bankId,
    date: e.date,
    recordedAt: e.createdAt,
    invoices: [
      { number: incomeEntryLabel(e.entryNumber), href: incomeHref(e.id) },
    ],
    counterparty: {
      name: e.receivedFrom?.trim() || e.headName,
      href: null,
    },
    invoiceAmountUsd: null,
    partial: false,
  };
  const rows: StatementRow[] = [
    {
      ...base,
      id: `ci_${e.id}_a`,
      invoiceType: INCOME_TYPE_LABEL,
      side: "DEBIT",
      amountUsd: e.amountUsd,
      original: formatOriginal(e.amount, e.code, e.exchangeRate),
      note: e.narration?.trim() ?? "",
      receiptHref: e.hasPdf ? incomeDocumentHref(e.id, "pdf") : null,
    },
  ];
  if (e.fee.greaterThan(0)) {
    rows.push({
      ...base,
      id: `ci_${e.id}_f`,
      invoiceType: INCOME_FEE_LABEL,
      side: "CREDIT",
      amountUsd: e.feeUsd,
      original: formatOriginal(e.fee, e.code, e.exchangeRate),
      note: "Bank fee on the amount received",
      receiptHref: null,
    });
  }
  return rows;
}

/* ---------------------------- Head × month report --------------------------- */

export interface IncomeReportCell {
  receivedUsd: Decimal;
  feesUsd: Decimal;
}

export interface IncomeReport {
  /** "YYYY-MM", oldest first. */
  months: string[];
  rows: {
    head: string;
    cells: Record<string, IncomeReportCell>;
    total: IncomeReportCell;
  }[];
  /** Per month, across every head. */
  totals: Record<string, IncomeReportCell>;
  grandTotal: IncomeReportCell;
}

const emptyCell = (): IncomeReportCell => ({
  receivedUsd: ZERO,
  feesUsd: ZERO,
});

const addCell = (
  c: IncomeReportCell,
  part: IncomeReportCell,
): IncomeReportCell => ({
  receivedUsd: c.receivedUsd.plus(part.receivedUsd),
  feesUsd: c.feesUsd.plus(part.feesUsd),
});

/** Totals per head and month of the entry date. */
export function buildIncomeReport(
  entries: { date: Date; head: string; amountUsd: Decimal; feeUsd: Decimal }[],
): IncomeReport {
  const byHead = new Map<string, Record<string, IncomeReportCell>>();
  const months = new Set<string>();
  for (const e of entries) {
    const month = e.date.toISOString().slice(0, 7);
    months.add(month);
    const cells = byHead.get(e.head) ?? {};
    cells[month] = addCell(cells[month] ?? emptyCell(), {
      receivedUsd: e.amountUsd,
      feesUsd: e.feeUsd,
    });
    byHead.set(e.head, cells);
  }

  const totals: Record<string, IncomeReportCell> = {};
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
  return { months: [...months].sort(), rows, totals, grandTotal };
}
