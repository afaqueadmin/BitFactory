import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";
import {
  parseDecimal,
  validatePaymentAccount,
} from "@/lib/accounting/paymentAccount";
import { transferAmounts } from "@/lib/accounting/bankTransfer";
import { verifyUploadedPdf } from "@/lib/storage/r2";

/**
 * Validates a Record / Edit transfer request (both use the same body) and
 * returns the columns to save. See bankTransfer.ts for the rules.
 */

export const MAX_TRANSFER_TEXT = 500;

interface SideRequest {
  entityId?: unknown;
  bankId?: unknown;
  currencyId?: unknown;
  amount?: unknown;
  fee?: unknown;
}

export interface TransferRequest {
  date?: unknown;
  from?: SideRequest;
  to?: SideRequest;
  /** 1 from currency = X to currency. */
  conversionRate?: unknown;
  /** 1 USD = X from currency; only when neither side is USD. */
  fromUsdRate?: unknown;
  reference?: unknown;
  note?: unknown;
  /** Uploaded PDF key, or null / "" for none. */
  receiptKey?: unknown;
}

export interface ParsedTransfer {
  data: Omit<
    Prisma.AccountingBankTransferUncheckedCreateInput,
    "id" | "createdBy" | "createdAt" | "updatedAt"
  >;
  /** For the audit log. */
  summary: {
    fromBank: string;
    fromEntity: string;
    fromCode: string;
    toBank: string;
    toEntity: string;
    toCode: string;
    amountUsd: Decimal;
  };
}

const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/** A blank fee is 0. */
const fee = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? new Decimal(0)
    : parseDecimal(v, { allowZero: true });

const optionalRate = (v: unknown) =>
  v === undefined || v === null || v === "" ? null : parseDecimal(v);

export async function parseTransferRequest(
  body: TransferRequest,
  { keepReceiptKey }: { keepReceiptKey?: string | null } = {},
): Promise<ParsedTransfer | { error: string }> {
  const date =
    typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? new Date(`${body.date}T00:00:00.000Z`)
      : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { error: "Date is required" };
  }

  const from = body.from ?? {};
  const to = body.to ?? {};
  const account = (s: SideRequest) => ({
    entityId: s.entityId,
    bankId: s.bankId,
    currencyId: s.currencyId,
  });
  const fromAccount = await validatePaymentAccount(account(from));
  if ("error" in fromAccount) return { error: `From: ${fromAccount.error}` };
  const toAccount = await validatePaymentAccount(account(to));
  if ("error" in toAccount) return { error: `To: ${toAccount.error}` };
  if (from.bankId === to.bankId && from.currencyId === to.currencyId) {
    return {
      error:
        "Pick a different bank, or a different currency of the same bank, to send to",
    };
  }

  const fromAmount = parseDecimal(from.amount);
  if (!fromAmount) return { error: "Amount sent must be greater than 0" };
  const toAmount = parseDecimal(to.amount);
  if (!toAmount) return { error: "Amount received must be greater than 0" };
  const fromFee = fee(from.fee);
  if (!fromFee) return { error: "Sending bank fee must be 0 or more" };
  const toFee = fee(to.fee);
  if (!toFee) return { error: "Receiving bank fee must be 0 or more" };

  const amounts = transferAmounts({
    fromCode: fromAccount.currencyCode,
    toCode: toAccount.currencyCode,
    fromAmount,
    fromFee,
    toAmount,
    toFee,
    conversionRate: optionalRate(body.conversionRate),
    fromUsdRate: optionalRate(body.fromUsdRate),
  });
  if ("error" in amounts) return amounts;

  const reference = text(body.reference);
  const note = text(body.note);
  if (
    (reference && reference.length > MAX_TRANSFER_TEXT) ||
    (note && note.length > MAX_TRANSFER_TEXT)
  ) {
    return {
      error: `Reference and note can be at most ${MAX_TRANSFER_TEXT} characters`,
    };
  }

  // Optional receipt. On an edit, the PDF already saved needs no new check.
  let receiptKey: string | null = null;
  if (typeof body.receiptKey === "string" && body.receiptKey) {
    if (body.receiptKey === keepReceiptKey) {
      receiptKey = keepReceiptKey;
    } else {
      const receipt = await verifyUploadedPdf(
        body.receiptKey,
        "bank-transfer-receipt",
      );
      if (!receipt.ok) return { error: receipt.error };
      receiptKey = receipt.key;
    }
  }

  return {
    data: {
      date,
      fromBankId: from.bankId as string,
      fromCurrencyId: from.currencyId as string,
      fromAmount,
      fromFee,
      fromExchangeRate: amounts.fromExchangeRate,
      toBankId: to.bankId as string,
      toCurrencyId: to.currencyId as string,
      conversionRate: amounts.conversionRate,
      toAmount,
      toFee,
      toExchangeRate: amounts.toExchangeRate,
      amountUsd: amounts.amountUsd,
      fromFeeUsd: amounts.fromFeeUsd,
      toFeeUsd: amounts.toFeeUsd,
      reference,
      note,
      receiptKey,
    },
    summary: {
      fromBank: fromAccount.bankName,
      fromEntity: fromAccount.entityName,
      fromCode: fromAccount.currencyCode,
      toBank: toAccount.bankName,
      toEntity: toAccount.entityName,
      toCode: toAccount.currencyCode,
      amountUsd: amounts.amountUsd,
    },
  };
}

/** The saved columns as written to an audit log entry. */
export const auditTransfer = (
  data: ParsedTransfer["data"],
  summary: ParsedTransfer["summary"],
) => ({
  date: data.date,
  from: {
    bank: summary.fromBank,
    entity: summary.fromEntity,
    currency: summary.fromCode,
    amount: String(data.fromAmount),
    fee: String(data.fromFee),
    exchangeRate: String(data.fromExchangeRate),
  },
  to: {
    bank: summary.toBank,
    entity: summary.toEntity,
    currency: summary.toCode,
    amount: String(data.toAmount),
    fee: String(data.toFee),
    exchangeRate: String(data.toExchangeRate),
  },
  conversionRate: String(data.conversionRate),
  amountUsd: String(data.amountUsd),
  fromFeeUsd: String(data.fromFeeUsd),
  toFeeUsd: String(data.toFeeUsd),
  reference: data.reference,
  note: data.note,
  receiptKey: data.receiptKey,
});
