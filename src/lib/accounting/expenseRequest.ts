import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parseDecimal,
  validatePaymentAccount,
} from "@/lib/accounting/paymentAccount";
import {
  checkAmountDue,
  expensePaymentAmounts,
} from "@/lib/accounting/expense";
import {
  cleanFileName,
  verifyUploadedPdf,
  verifyUploadedSheet,
} from "@/lib/storage/r2";

/**
 * Validates Add / Edit expense and Record / Edit payment requests and
 * returns the columns to save. The rules are in expense.ts.
 */

export const MAX_EXPENSE_TEXT = 1000;

/** A head with the number of expenses using it. */
export const headCountInclude = {
  _count: { select: { expenses: true } },
} satisfies Prisma.AccountingExpenseHeadInclude;

const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const day = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? new Date(`${v}T00:00:00.000Z`)
    : null;

const validDay = (d: Date | null): d is Date =>
  !!d && !Number.isNaN(d.getTime());

/** An uploaded file as the forms send it. */
interface FileRequest {
  key?: unknown;
  fileName?: unknown;
}

export interface ExpenseRequest {
  date?: unknown;
  headId?: unknown;
  narration?: unknown;
  amountDueUsd?: unknown;
  /** Uploaded PDF, or null for none. */
  pdf?: FileRequest | null;
  /** Uploaded Excel / CSV sheet, or null for none. */
  sheet?: FileRequest | null;
}

export type ParsedExpense = Pick<
  Prisma.AccountingExpenseUncheckedCreateInput,
  | "date"
  | "headId"
  | "narration"
  | "pdfKey"
  | "pdfName"
  | "sheetKey"
  | "sheetName"
> & { amountDueUsd: Decimal };

/**
 * Checks an expense. On an edit, `existing` keeps its saved files without a
 * new check and lets it keep a head that has since been deactivated.
 */
export async function parseExpenseRequest(
  body: ExpenseRequest,
  existing?: {
    headId: string;
    pdfKey: string | null;
    pdfName: string | null;
    sheetKey: string | null;
    sheetName: string | null;
  },
): Promise<{ data: ParsedExpense; headName: string } | { error: string }> {
  const date = day(body.date);
  if (!validDay(date)) return { error: "Date is required" };

  if (typeof body.headId !== "string" || !body.headId) {
    return { error: "Head is required" };
  }
  const head = await prisma.accountingExpenseHead.findUnique({
    where: { id: body.headId },
    select: { name: true, isActive: true },
  });
  if (!head || (!head.isActive && body.headId !== existing?.headId)) {
    return { error: "The selected head is not available" };
  }

  const amountDueUsd = parseDecimal(body.amountDueUsd);
  const dueError = checkAmountDue(amountDueUsd);
  if (dueError || !amountDueUsd) return { error: dueError ?? "" };

  const narration = text(body.narration);
  if (narration && narration.length > MAX_EXPENSE_TEXT) {
    return {
      error: `Narration can be at most ${MAX_EXPENSE_TEXT} characters`,
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
      const checked = await verifyUploadedPdf(pdf.key, "expense-attachment");
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
      const checked = await verifyUploadedSheet(sheet.key, "expense-sheet");
      if (!checked.ok) return { error: checked.error };
      sheetKey = checked.key;
      sheetName = cleanFileName(sheet.fileName);
    }
  }

  return {
    data: {
      date,
      headId: body.headId,
      narration,
      amountDueUsd,
      pdfKey,
      pdfName,
      sheetKey,
      sheetName,
    },
    headName: head.name,
  };
}

export interface ExpensePaymentRequest {
  date?: unknown;
  entityId?: unknown;
  bankId?: unknown;
  currencyId?: unknown;
  /** 1 USD = X currency. */
  exchangeRate?: unknown;
  /** In the bank's currency, without the fee. */
  amount?: unknown;
  /** In the bank's currency; blank = 0. */
  fee?: unknown;
  note?: unknown;
  /** Uploaded receipt PDF key, or null / "" for none. */
  receiptKey?: unknown;
  /** The browser's time zone: "today" for the no-future-date rule. */
  tz?: unknown;
}

export interface ParsedExpensePayment {
  data: Pick<
    Prisma.AccountingExpensePaymentUncheckedCreateInput,
    "date" | "bankId" | "currencyId" | "note" | "receiptKey"
  > & {
    exchangeRate: Decimal;
    amount: Decimal;
    fee: Decimal;
    amountUsd: Decimal;
    feeUsd: Decimal;
  };
  /** For the audit log. */
  summary: { bank: string; entity: string; code: string };
}

/** Checks a payment's account and amounts (not the balance: see the route). */
export async function parseExpensePaymentRequest(
  body: ExpensePaymentRequest,
  { keepReceiptKey }: { keepReceiptKey?: string | null } = {},
): Promise<ParsedExpensePayment | { error: string }> {
  const date = day(body.date);
  if (!validDay(date)) return { error: "Payment date is required" };

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
  const amount = parseDecimal(body.amount);
  if (!amount) {
    return { error: "Amount paid must be greater than 0 (up to 2 decimals)" };
  }
  const fee =
    body.fee === undefined || body.fee === null || body.fee === ""
      ? new Decimal(0)
      : parseDecimal(body.fee, { allowZero: true });
  if (!fee) return { error: "Fee must be 0 or more (up to 2 decimals)" };

  const amounts = expensePaymentAmounts({
    code: account.currencyCode,
    amount,
    fee,
    rate,
  });
  if ("error" in amounts) return amounts;

  const note = text(body.note);
  if (note && note.length > MAX_EXPENSE_TEXT) {
    return { error: `Note can be at most ${MAX_EXPENSE_TEXT} characters` };
  }

  // Optional receipt. On an edit, the PDF already saved needs no new check.
  let receiptKey: string | null = null;
  if (typeof body.receiptKey === "string" && body.receiptKey) {
    if (body.receiptKey === keepReceiptKey) {
      receiptKey = keepReceiptKey;
    } else {
      const receipt = await verifyUploadedPdf(
        body.receiptKey,
        "expense-payment-receipt",
      );
      if (!receipt.ok) return { error: receipt.error };
      receiptKey = receipt.key;
    }
  }

  return {
    data: {
      date,
      bankId: body.bankId as string,
      currencyId: body.currencyId as string,
      exchangeRate: rate,
      amount,
      fee,
      amountUsd: amounts.amountUsd,
      feeUsd: amounts.feeUsd,
      note,
      receiptKey,
    },
    summary: {
      bank: account.bankName,
      entity: account.entityName,
      code: account.currencyCode,
    },
  };
}

/** A payment as written to an audit log entry. */
export const auditExpensePayment = (
  data: ParsedExpensePayment["data"],
  summary: ParsedExpensePayment["summary"],
) => ({
  date: data.date,
  entity: summary.entity,
  bank: summary.bank,
  currency: summary.code,
  exchangeRate: data.exchangeRate.toString(),
  amount: data.amount.toString(),
  fee: data.fee.toString(),
  amountUsd: data.amountUsd.toString(),
  feeUsd: data.feeUsd.toString(),
  note: data.note,
  receiptKey: data.receiptKey,
});
