import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parseDecimal,
  validatePaymentAccount,
} from "@/lib/accounting/paymentAccount";
import { checkIncomeDate, incomeAmounts } from "@/lib/accounting/capitalIncome";
import { todayIn, ymd } from "@/lib/accounting/expense";
import {
  cleanFileName,
  verifyUploadedPdf,
  verifyUploadedSheet,
} from "@/lib/storage/r2";

/**
 * Validates Add / Edit Capital & Income requests and returns the columns to
 * save. The rules are in capitalIncome.ts.
 */

export const MAX_INCOME_TEXT = 1000;

/** A head with the number of entries using it. */
export const incomeHeadCountInclude = {
  _count: { select: { entries: true } },
} satisfies Prisma.AccountingIncomeHeadInclude;

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

export interface IncomeRequest {
  date?: unknown;
  headId?: unknown;
  entityId?: unknown;
  bankId?: unknown;
  currencyId?: unknown;
  /** 1 USD = X currency. */
  exchangeRate?: unknown;
  /** In the bank's currency, before the fee. */
  amount?: unknown;
  /** In the bank's currency; blank = 0. */
  fee?: unknown;
  receivedFrom?: unknown;
  narration?: unknown;
  /** Uploaded PDF, or null for none. */
  pdf?: FileRequest | null;
  /** Uploaded Excel / CSV sheet, or null for none. */
  sheet?: FileRequest | null;
  /** The browser's time zone: "today" for the no-future-date rule. */
  tz?: unknown;
}

export type ParsedIncome = Pick<
  Prisma.AccountingIncomeUncheckedCreateInput,
  | "date"
  | "headId"
  | "bankId"
  | "currencyId"
  | "receivedFrom"
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

export interface IncomeSummary {
  head: string;
  bank: string;
  entity: string;
  code: string;
}

/**
 * Checks an entry. On an edit, `existing` keeps its saved files without a
 * new check and lets it keep a head that has since been deactivated.
 */
export async function parseIncomeRequest(
  body: IncomeRequest,
  existing?: {
    headId: string;
    pdfKey: string | null;
    pdfName: string | null;
    sheetKey: string | null;
    sheetName: string | null;
  },
): Promise<{ data: ParsedIncome; summary: IncomeSummary } | { error: string }> {
  const date = day(body.date);
  if (!date || Number.isNaN(date.getTime())) {
    return { error: "Date is required" };
  }
  const dateError = checkIncomeDate({
    date: ymd(date),
    today: todayIn(body.tz),
  });
  if (dateError) return { error: dateError };

  if (typeof body.headId !== "string" || !body.headId) {
    return { error: "Head is required" };
  }
  const head = await prisma.accountingIncomeHead.findUnique({
    where: { id: body.headId },
    select: { name: true, isActive: true },
  });
  if (!head || (!head.isActive && body.headId !== existing?.headId)) {
    return { error: "The selected head is not available" };
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
  const amount = parseDecimal(body.amount);
  if (!amount) {
    return {
      error: "Amount received must be greater than 0 (up to 2 decimals)",
    };
  }
  const fee =
    body.fee === undefined || body.fee === null || body.fee === ""
      ? new Decimal(0)
      : parseDecimal(body.fee, { allowZero: true });
  if (!fee) return { error: "Fee must be 0 or more (up to 2 decimals)" };

  const amounts = incomeAmounts({
    code: account.currencyCode,
    amount,
    fee,
    rate,
  });
  if ("error" in amounts) return amounts;

  const receivedFrom = text(body.receivedFrom);
  if (receivedFrom && receivedFrom.length > MAX_INCOME_TEXT) {
    return {
      error: `Received from can be at most ${MAX_INCOME_TEXT} characters`,
    };
  }
  const narration = text(body.narration);
  if (narration && narration.length > MAX_INCOME_TEXT) {
    return {
      error: `Narration can be at most ${MAX_INCOME_TEXT} characters`,
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
      const checked = await verifyUploadedPdf(pdf.key, "income-attachment");
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
      const checked = await verifyUploadedSheet(sheet.key, "income-sheet");
      if (!checked.ok) return { error: checked.error };
      sheetKey = checked.key;
      sheetName = cleanFileName(sheet.fileName);
    }
  }

  return {
    data: {
      date,
      headId: body.headId,
      bankId: body.bankId as string,
      currencyId: body.currencyId as string,
      exchangeRate: rate,
      amount,
      fee,
      amountUsd: amounts.amountUsd,
      feeUsd: amounts.feeUsd,
      receivedFrom,
      narration,
      pdfKey,
      pdfName,
      sheetKey,
      sheetName,
    },
    summary: {
      head: head.name,
      bank: account.bankName,
      entity: account.entityName,
      code: account.currencyCode,
    },
  };
}

/** An entry as written to an audit log entry. */
export const auditIncome = (
  data: {
    date: Date | string;
    exchangeRate: Decimal | string;
    amount: Decimal | string;
    fee: Decimal | string;
    amountUsd: Decimal | string;
    feeUsd: Decimal | string;
    receivedFrom?: string | null;
    narration?: string | null;
    pdfKey?: string | null;
    sheetKey?: string | null;
  },
  summary: IncomeSummary,
) => ({
  date: data.date,
  head: summary.head,
  entity: summary.entity,
  bank: summary.bank,
  currency: summary.code,
  exchangeRate: String(data.exchangeRate),
  amount: String(data.amount),
  fee: String(data.fee),
  amountUsd: String(data.amountUsd),
  feeUsd: String(data.feeUsd),
  receivedFrom: data.receivedFrom ?? null,
  narration: data.narration ?? null,
  pdfKey: data.pdfKey ?? null,
  sheetKey: data.sheetKey ?? null,
});
