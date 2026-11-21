import { Decimal } from "@prisma/client/runtime/library";
import {
  customerInvoiceHref,
  formatOriginal,
  StatementRow,
} from "@/lib/accounting/bankStatementRows";
import { reconciliationTypeLabel } from "@/lib/accounting/bankReconciliationLists";

export {
  isReconciliationInvoiceType,
  RECONCILIATION_INVOICE_TYPES,
  reconciliationTypeLabel,
} from "@/lib/accounting/bankReconciliationLists";
export type { ReconciliationInvoiceType } from "@/lib/accounting/bankReconciliationLists";

/**
 * Pure part of Bank Reconciliation (no database): the invoice types, amounts
 * and the statement rows of one entry.
 *
 * Rules (decided 2026-11-19):
 * - One entry says which bank received the money of one PAID customer
 *   invoice that is on no bank statement (paid before the bank field
 *   existed, or marked as paid with no amount). The invoice and its
 *   payments are not changed.
 * - Amount and fee are typed in the bank's currency, with the rate 1 USD =
 *   X currency; USD = amount ÷ rate, fee USD = fee ÷ rate (to cents). The
 *   amount may be 0 (a "Mark as Paid" invoice).
 * - Always a Debit of amountUsd on the bank, plus its own fee Credit row
 *   when the fee is above 0.
 * - The date can't be in the future (checkIncomeDate).
 */

const USD = "USD";

const cents = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const twoDp = (v: Decimal) => v.decimalPlaces() <= 2;

export const RECONCILIATION_FEE_LABEL = "Bank Reconciliation Fee";

export interface ReconciliationAmountsInput {
  /** The bank currency's code. */
  code: string;
  /** In the bank's currency, before the fee; 0 allowed. */
  amount: Decimal;
  /** In the bank's currency. */
  fee: Decimal;
  /** 1 USD = rate currency. */
  rate: Decimal;
}

/** Checks one entry's amounts and works out their USD values. */
export function reconciliationAmounts(
  input: ReconciliationAmountsInput,
): { amountUsd: Decimal; feeUsd: Decimal } | { error: string } {
  const { code, amount, fee, rate } = input;
  if (amount.isNegative() || !twoDp(amount)) {
    return { error: "Amount must be 0 or more (up to 2 decimals)" };
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
  return {
    amountUsd: cents(amount.dividedBy(rate)),
    feeUsd: cents(fee.dividedBy(rate)),
  };
}

/** Entry # as shown: "REC-0001" (4 digits at least). */
export const reconciliationEntryLabel = (entryNumber: number) =>
  `REC-${String(entryNumber).padStart(4, "0")}`;

export const reconciliationDocumentHref = (id: string, kind: "pdf" | "sheet") =>
  `/api/accounting/bank-reconciliation/${id}/documents/${kind}`;

/** The narration pre-filled from the invoice's payment notes. */
export const joinPaymentNotes = (notes: (string | null)[]): string =>
  notes
    .map((n) => n?.trim() ?? "")
    .filter(Boolean)
    .join(" · ");

/** A saved entry with what its statement rows show. */
export interface ReconciliationForRows {
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
  narration: string | null;
  hasPdf: boolean;
  invoice: {
    id: string;
    invoiceNumber: string;
    invoiceType: string;
    totalAmount: Decimal;
  };
  clientName: string;
}

/**
 * The rows of one entry: a Debit (0 allowed), plus a "Bank Reconciliation
 * Fee" Credit when the fee is above 0. Transactions Against = the invoice
 * (linked) with its type under it; To/From = the client; Amount Due = the
 * invoice total. Ids sort the amount first on a tie.
 */
export function reconciliationStatementRows(
  e: ReconciliationForRows,
): StatementRow[] {
  const base = {
    source: "RECONCILIATION" as const,
    bankId: e.bankId,
    date: e.date,
    recordedAt: e.createdAt,
    invoices: [
      {
        number: e.invoice.invoiceNumber,
        href: customerInvoiceHref(e.invoice.invoiceType, e.invoice.id),
      },
    ],
    counterparty: { name: e.clientName, href: null },
    invoiceAmountUsd: e.invoice.totalAmount,
    partial: false,
  };
  const rows: StatementRow[] = [
    {
      ...base,
      id: `br_${e.id}_a`,
      invoiceType: reconciliationTypeLabel(e.invoice.invoiceType),
      side: "DEBIT",
      amountUsd: e.amountUsd,
      original: formatOriginal(e.amount, e.code, e.exchangeRate),
      note: e.narration?.trim() ?? "",
      receiptHref: e.hasPdf ? reconciliationDocumentHref(e.id, "pdf") : null,
    },
  ];
  if (e.fee.greaterThan(0)) {
    rows.push({
      ...base,
      id: `br_${e.id}_f`,
      invoiceType: RECONCILIATION_FEE_LABEL,
      side: "CREDIT",
      amountUsd: e.feeUsd,
      original: formatOriginal(e.fee, e.code, e.exchangeRate),
      note: "Bank fee on the amount received",
      receiptHref: null,
    });
  }
  return rows;
}
