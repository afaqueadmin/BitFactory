import { Decimal } from "@prisma/client/runtime/library";
import { paymentTypeLabel } from "@/lib/accounting/paymentTypes";
import {
  formatTableCurrency,
  formatTableDate,
} from "@/lib/helpers/admin/tableExport";

/**
 * Pure part of the bank statement (no database): row shape, labels, links,
 * notes and the balance maths. Loaded by lib/accounting/bankStatement.ts.
 *
 * A bank's money is in four tables, each row one statement row:
 * - COST_PAYMENT: CostPayment received on a customer invoice (Debit)
 * - VENDOR_PART: VendorPaymentPart sent for a Farm Tariff / Hardware
 *   Purchase (Credit)
 * - CONSOLIDATED: VendorConsolidatedPayment, one transfer for several
 *   vendor invoices (Credit)
 * - DEPOSIT_RETURN: VendorDepositMovement RETURN, a vendor paying a
 *   security deposit back (Debit)
 * - TRANSFER: AccountingBankTransfer between two of our banks: Credit on
 *   the sending bank, Debit on the receiving one, and a Credit row per fee
 *   (see bankTransfer.ts). Up to four rows per transfer.
 * - EXPENSE: AccountingExpensePayment, an expense paid from the bank
 *   (Credit), plus an "Expense Fee" Credit row when it has a fee (see
 *   expense.ts).
 * All amounts are the USD value saved with the payment.
 */

export type StatementSource =
  | "COST_PAYMENT"
  | "VENDOR_PART"
  | "CONSOLIDATED"
  | "DEPOSIT_RETURN"
  | "TRANSFER"
  | "EXPENSE";

export type StatementSide = "DEBIT" | "CREDIT";

export interface StatementLink {
  number: string;
  href: string;
}

export interface StatementRow {
  /** Source-prefixed id: cp_, vp_, cvp_, dr_, bt_ or ep_. */
  id: string;
  source: StatementSource;
  /** The bank the money went into or came out of. */
  bankId: string;
  /** Payment date. */
  date: Date;
  /** When it was recorded; breaks ties between same-day rows. */
  recordedAt: Date;
  invoices: StatementLink[];
  invoiceType: string;
  counterparty: { name: string; href: string | null };
  /** Invoice total (sum of totals for a consolidated payment). */
  invoiceAmountUsd: Decimal | null;
  side: StatementSide;
  amountUsd: Decimal;
  /** e.g. "3,670.00 AED @ 3.67", or null when no currency was saved. */
  original: string | null;
  /** Another payment also paid this invoice. */
  partial: boolean;
  note: string;
  receiptHref: string | null;
}

export interface StatementRowWithBalance extends StatementRow {
  balanceUsd: Decimal;
}

export interface Statement {
  openingBalanceUsd: Decimal;
  totals: { debitUsd: Decimal; creditUsd: Decimal };
  closingBalanceUsd: Decimal;
  rows: StatementRowWithBalance[];
}

const ZERO = new Decimal(0);

/** CostPayment.amount is a Float: to cents as a Decimal before any sum. */
export const floatUsd = (value: number): Decimal =>
  new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** "$1,234.56" / "-$500.00", as on the accounting tables. */
export const usd = (value: Decimal): string =>
  formatTableCurrency(value.toFixed(2));

/** A fee in the payment's currency, in USD at its rate (to cents). */
export const feeUsd = (fee: Decimal, rate: Decimal): Decimal =>
  rate.isZero()
    ? ZERO
    : fee.dividedBy(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

const amountFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "3,670.00 AED". */
export const formatAmount = (amount: Decimal, code: string): string =>
  `${amountFormat.format(amount.toNumber())} ${code}`;

/** "3,670.00 AED @ 3.67" (rate only for non-USD), or null with no currency. */
export function formatOriginal(
  amount: Decimal | null,
  code: string | null | undefined,
  rate: Decimal | null,
): string | null {
  if (!amount || !code) return null;
  const text = `${amountFormat.format(amount.toNumber())} ${code}`;
  return code !== "USD" && rate ? `${text} @ ${rate.toString()}` : text;
}

/**
 * Invoice Type of a customer payment, by its section: a Hardware Sales
 * invoice that also bills hosting has a HARDWARE_SALES and a PAYMENT row.
 */
export function customerPaymentTypeLabel(
  paymentType: string,
  invoiceType: string | null | undefined,
): string {
  if (paymentType === "HARDWARE_SALES") return "Hardware Sales";
  if (paymentType === "HARDWARE_REPAIR") return "Hardware Repair";
  if (paymentType === "PAYMENT") {
    return invoiceType === "HARDWARE_PURCHASE"
      ? "Hardware Procurement"
      : "Hosting & Colocation";
  }
  return paymentTypeLabel(paymentType);
}

/** Admin page of a customer invoice. */
export function customerInvoiceHref(invoiceType: string, id: string): string {
  if (invoiceType === "HARDWARE_SALES")
    return `/accounting/hardware-sales/${id}`;
  if (invoiceType === "HARDWARE_REPAIR") {
    return `/accounting/hardware-repair/${id}`;
  }
  return `/accounting/${id}`;
}

export type VendorKind = "farm" | "hardware";

export const vendorKindLabel = (kind: VendorKind): string =>
  kind === "hardware" ? "Hardware Purchase" : "Farm Tariff";

export const vendorInvoiceHref = (kind: VendorKind, id: string): string =>
  kind === "hardware"
    ? `/accounting/hardwarePurchase/${id}`
    : `/accounting/vendorInvoice/${id}`;

export const vendorReceiptHref = (kind: VendorKind, id: string): string =>
  kind === "hardware"
    ? `/api/hardware-purchases/${id}/documents/receipt`
    : `/api/vendor-invoices/${id}/documents/receipt`;

/** Another payment of the same invoice, for the split note. */
export interface SiblingPayment {
  id: string;
  amountUsd: Decimal;
  /** Bank name, or a short label when no bank was saved (e.g. "memo"). */
  via: string;
  date: Date;
}

/** This row is less than its invoice: the rest was paid elsewhere or is due. */
export const isPartial = (thisAmountUsd: Decimal, invoiceTotalUsd: Decimal) =>
  thisAmountUsd.lessThan(invoiceTotalUsd);

/**
 * "Partial: $6,000.00 of $10,000.00 · also $4,000.00 via Bank B (Nov 5,
 * 2026) · outstanding $0.00", or "" when nothing else paid the invoice.
 * "Partial:" only when this row is less than the invoice. `payments` are
 * every payment of the invoice, this one included. withOutstanding (customer
 * invoices; vendor ones are fully paid) adds what is still due, or
 * "overpaid $X" when the payments add up to more than the invoice.
 */
export function splitNote({
  thisId,
  thisAmountUsd,
  invoiceTotalUsd,
  payments,
  withOutstanding,
  tz,
}: {
  thisId: string;
  thisAmountUsd: Decimal;
  invoiceTotalUsd: Decimal;
  payments: SiblingPayment[];
  withOutstanding: boolean;
  tz: string;
}): string {
  const others = payments
    .filter((p) => p.id !== thisId)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (others.length === 0) return "";
  const share = `${usd(thisAmountUsd)} of ${usd(invoiceTotalUsd)}`;
  const parts = [
    isPartial(thisAmountUsd, invoiceTotalUsd) ? `Partial: ${share}` : share,
    `also ${others
      .map(
        (p) =>
          `${usd(p.amountUsd)} via ${p.via} (${formatTableDate(p.date, tz)})`,
      )
      .join(", ")}`,
  ];
  if (withOutstanding) {
    const paid = payments.reduce((s, p) => s.plus(p.amountUsd), ZERO);
    const due = invoiceTotalUsd.minus(paid);
    parts.push(
      due.isNegative()
        ? `overpaid ${usd(due.negated())}`
        : `outstanding ${usd(due)}`,
    );
  }
  return parts.join(" · ");
}

/** Joins the non-empty note parts with " · ". */
export const joinNote = (...parts: (string | null | undefined)[]): string =>
  parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" · ");

const compareRows = (a: StatementRow, b: StatementRow) =>
  a.date.getTime() - b.date.getTime() ||
  a.recordedAt.getTime() - b.recordedAt.getTime() ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const signed = (row: StatementRow) =>
  row.side === "DEBIT" ? row.amountUsd : row.amountUsd.negated();

/**
 * Sorts oldest first, then: opening balance = rows before `from`; rows in
 * [from, toExclusive) with a running balance continuing from it; totals of
 * those rows; closing balance. No bounds = whole history from 0.
 */
export function buildStatement(
  all: StatementRow[],
  range: { from?: Date | null; toExclusive?: Date | null } = {},
): Statement {
  const sorted = [...all].sort(compareRows);
  let opening = ZERO;
  let balance = ZERO;
  let debit = ZERO;
  let credit = ZERO;
  const rows: StatementRowWithBalance[] = [];
  for (const row of sorted) {
    if (range.from && row.date < range.from) {
      opening = opening.plus(signed(row));
      continue;
    }
    if (range.toExclusive && row.date >= range.toExclusive) continue;
    if (rows.length === 0) balance = opening;
    balance = balance.plus(signed(row));
    if (row.side === "DEBIT") debit = debit.plus(row.amountUsd);
    else credit = credit.plus(row.amountUsd);
    rows.push({ ...row, balanceUsd: balance });
  }
  return {
    openingBalanceUsd: opening,
    totals: { debitUsd: debit, creditUsd: credit },
    closingBalanceUsd: rows.length ? balance : opening,
    rows,
  };
}
