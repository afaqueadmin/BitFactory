import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parseDecimal,
  validatePaymentAccount,
} from "@/lib/accounting/paymentAccount";
import { checkIncomeDate } from "@/lib/accounting/capitalIncome";
import {
  isReconciliationInvoiceType,
  ReconciliationInvoiceType,
  reconciliationAmounts,
} from "@/lib/accounting/bankReconciliation";
import { todayIn, ymd } from "@/lib/accounting/expense";
import {
  cleanFileName,
  verifyUploadedPdf,
  verifyUploadedSheet,
} from "@/lib/storage/r2";

/**
 * Validates Add / Edit Bank Reconciliation requests, and finds the invoices
 * an entry can be made for. The rules are in bankReconciliation.ts.
 */

export const MAX_RECONCILIATION_TEXT = 1000;

/**
 * PAID customer invoices of one type that are on no bank statement: no
 * payment with a bank and an amount (what the statements read, see
 * costPaymentWhere in bankStatement.ts) and no reconciliation yet, except
 * `keepInvoiceId` (the entry being edited).
 */
export const candidateInvoiceWhere = (
  invoiceType: ReconciliationInvoiceType,
  keepInvoiceId?: string,
): Prisma.InvoiceWhereInput => {
  const unreconciled: Prisma.InvoiceWhereInput = keepInvoiceId
    ? {
        OR: [{ bankReconciliation: { is: null } }, { id: keepInvoiceId }],
      }
    : { bankReconciliation: { is: null } };
  return {
    status: "PAID",
    invoiceType,
    costPayments: {
      none: { isDeleted: false, bankId: { not: null }, NOT: { amount: 0 } },
    },
    ...unreconciled,
  };
};

const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const day = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? new Date(`${v}T00:00:00.000Z`)
    : null;

/** An uploaded file as the form sends it. */
interface FileRequest {
  key?: unknown;
  fileName?: unknown;
}

export interface ReconciliationRequest {
  date?: unknown;
  invoiceType?: unknown;
  invoiceId?: unknown;
  entityId?: unknown;
  bankId?: unknown;
  currencyId?: unknown;
  /** 1 USD = X currency. */
  exchangeRate?: unknown;
  /** In the bank's currency, before the fee; 0 allowed. */
  amount?: unknown;
  /** In the bank's currency; blank = 0. */
  fee?: unknown;
  narration?: unknown;
  pdf?: FileRequest | null;
  sheet?: FileRequest | null;
  /** The browser's time zone: "today" for the no-future-date rule. */
  tz?: unknown;
}

export type ParsedReconciliation = Pick<
  Prisma.AccountingBankReconciliationUncheckedCreateInput,
  | "date"
  | "invoiceId"
  | "bankId"
  | "currencyId"
  | "narration"
  | "pdfKey"
  | "pdfName"
  | "sheetKey"
  | "sheetName"
> & {
  exchangeRate: Decimal;
  amount: Decimal;
  fee: Decimal;
  amountUsd: Decimal;
  feeUsd: Decimal;
};

export interface ReconciliationSummary {
  invoiceNumber: string;
  invoiceType: ReconciliationInvoiceType;
  bank: string;
  entity: string;
  code: string;
}

/**
 * Checks an entry. On an edit, `existing` keeps its saved files without a
 * new check and lets it keep its own invoice. The invoice is checked here;
 * the routes check it again inside the save transaction.
 */
export async function parseReconciliationRequest(
  body: ReconciliationRequest,
  existing?: {
    invoiceId: string;
    pdfKey: string | null;
    pdfName: string | null;
    sheetKey: string | null;
    sheetName: string | null;
  },
): Promise<
  | { data: ParsedReconciliation; summary: ReconciliationSummary }
  | { error: string }
> {
  const date = day(body.date);
  if (!date || Number.isNaN(date.getTime())) {
    return { error: "Date is required" };
  }
  const dateError = checkIncomeDate({
    date: ymd(date),
    today: todayIn(body.tz),
  });
  if (dateError) return { error: dateError };

  if (!isReconciliationInvoiceType(body.invoiceType)) {
    return { error: "Invoice type is required" };
  }
  const invoiceType = body.invoiceType;
  if (typeof body.invoiceId !== "string" || !body.invoiceId) {
    return { error: "Invoice number is required" };
  }
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: body.invoiceId,
      ...candidateInvoiceWhere(invoiceType, existing?.invoiceId),
    },
    select: { id: true, invoiceNumber: true },
  });
  if (!invoice) {
    return {
      error:
        "This invoice can't be reconciled: it must be a paid invoice of the chosen type that is on no bank statement and not reconciled yet",
    };
  }

  const account = await validatePaymentAccount({
    entityId: body.entityId,
    bankId: body.bankId,
    currencyId: body.currencyId,
  });
  if ("error" in account) return account;

  const rate = parseDecimal(body.exchangeRate);
  if (!rate) {
    return {
      error: "Exchange rate must be greater than 0 (up to 8 decimal places)",
    };
  }
  const amount = parseDecimal(body.amount, { allowZero: true });
  if (!amount) {
    return { error: "Amount must be 0 or more (up to 2 decimals)" };
  }
  const fee =
    body.fee === undefined || body.fee === null || body.fee === ""
      ? new Decimal(0)
      : parseDecimal(body.fee, { allowZero: true });
  if (!fee) return { error: "Fee must be 0 or more (up to 2 decimals)" };

  const amounts = reconciliationAmounts({
    code: account.currencyCode,
    amount,
    fee,
    rate,
  });
  if ("error" in amounts) return amounts;

  const narration = text(body.narration);
  if (narration && narration.length > MAX_RECONCILIATION_TEXT) {
    return {
      error: `Narration can be at most ${MAX_RECONCILIATION_TEXT} characters`,
    };
  }

  // Optional PDF.
  let pdfKey: string | null = null;
  let pdfName: string | null = null;
  const pdf = body.pdf;
  if (pdf && typeof pdf.key === "string" && pdf.key) {
    if (existing && pdf.key === existing.pdfKey) {
      pdfKey = existing.pdfKey;
      pdfName = existing.pdfName;
    } else {
      const checked = await verifyUploadedPdf(
        pdf.key,
        "reconciliation-attachment",
      );
      if (!checked.ok) return { error: checked.error };
      pdfKey = checked.key;
      pdfName = cleanFileName(pdf.fileName);
    }
  }

  // Optional Excel / CSV sheet.
  let sheetKey: string | null = null;
  let sheetName: string | null = null;
  const sheet = body.sheet;
  if (sheet && typeof sheet.key === "string" && sheet.key) {
    if (existing && sheet.key === existing.sheetKey) {
      sheetKey = existing.sheetKey;
      sheetName = existing.sheetName;
    } else {
      const checked = await verifyUploadedSheet(
        sheet.key,
        "reconciliation-sheet",
      );
      if (!checked.ok) return { error: checked.error };
      sheetKey = checked.key;
      sheetName = cleanFileName(sheet.fileName);
    }
  }

  return {
    data: {
      date,
      invoiceId: invoice.id,
      bankId: body.bankId as string,
      currencyId: body.currencyId as string,
      exchangeRate: rate,
      amount,
      fee,
      amountUsd: amounts.amountUsd,
      feeUsd: amounts.feeUsd,
      narration,
      pdfKey,
      pdfName,
      sheetKey,
      sheetName,
    },
    summary: {
      invoiceNumber: invoice.invoiceNumber,
      invoiceType,
      bank: account.bankName,
      entity: account.entityName,
      code: account.currencyCode,
    },
  };
}

/**
 * Inside the save transaction: the invoice still qualifies (no banked
 * payment or other reconciliation appeared since the form was checked).
 * The unique invoiceId catches two saves at once.
 */
export async function invoiceStillQualifies(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  invoiceType: ReconciliationInvoiceType,
  keepInvoiceId?: string,
): Promise<boolean> {
  const n = await tx.invoice.count({
    where: {
      id: invoiceId,
      ...candidateInvoiceWhere(invoiceType, keepInvoiceId),
    },
  });
  return n === 1;
}

/** An entry as written to an audit log entry. */
export const auditReconciliation = (
  data: {
    date: Date | string;
    exchangeRate: Decimal | string;
    amount: Decimal | string;
    fee: Decimal | string;
    amountUsd: Decimal | string;
    feeUsd: Decimal | string;
    narration?: string | null;
    pdfKey?: string | null;
    sheetKey?: string | null;
  },
  summary: ReconciliationSummary,
) => ({
  date: data.date,
  invoice: summary.invoiceNumber,
  invoiceType: summary.invoiceType,
  entity: summary.entity,
  bank: summary.bank,
  currency: summary.code,
  exchangeRate: String(data.exchangeRate),
  amount: String(data.amount),
  fee: String(data.fee),
  amountUsd: String(data.amountUsd),
  feeUsd: String(data.feeUsd),
  narration: data.narration ?? null,
  pdfKey: data.pdfKey ?? null,
  sheetKey: data.sheetKey ?? null,
});
