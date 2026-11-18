import { Decimal } from "@prisma/client/runtime/library";
import {
  formatAmount,
  formatOriginal,
  joinNote,
  StatementRow,
} from "@/lib/accounting/bankStatementRows";

/**
 * Pure part of internal bank transfers (no database): the rate / USD rules
 * and the statement rows of one transfer.
 *
 * Rules (decided 2026-11-10):
 * - The sending bank loses amount sent + its fee (in its currency); the
 *   receiving bank gains amount received and pays its own fee, if any.
 *   Each fee is its own "Transfer Fee" Credit row.
 * - The bank's conversion rate (1 from = r to) is the only rate between the
 *   sides, so received = sent × r. Both sides carry the same USD value,
 *   taken from the USD side when there is one, else sent ÷ the entered USD
 *   rate (1 USD = X from currency). So there is never an FX difference.
 * - Each side's "1 USD = X" rate is worked out from that USD value, for the
 *   grey "200.00 AED @ 2" line on the statements.
 */

const USD = "USD";

const cents = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const rate8 = (v: Decimal) => v.toDecimalPlaces(8, Decimal.ROUND_HALF_UP);

export interface TransferAmountsInput {
  fromCode: string;
  toCode: string;
  /** Sent, without the fee, in the from currency. */
  fromAmount: Decimal;
  fromFee: Decimal;
  /** 1 from = conversionRate to. Ignored (1) when the currencies match. */
  conversionRate: Decimal | null;
  /** Received, in the to currency. */
  toAmount: Decimal;
  toFee: Decimal;
  /** 1 USD = X from currency; only used when neither side is USD. */
  fromUsdRate: Decimal | null;
}

export interface TransferAmounts {
  conversionRate: Decimal;
  fromExchangeRate: Decimal;
  toExchangeRate: Decimal;
  amountUsd: Decimal;
  fromFeeUsd: Decimal;
  toFeeUsd: Decimal;
}

const twoDp = (v: Decimal) => v.decimalPlaces() <= 2;

/**
 * Largest gap allowed between sent × rate and the received amount: half a
 * cent of rounding, plus the error of a rate rounded to 8 decimals.
 */
const receivedTolerance = (fromAmount: Decimal) =>
  new Decimal("0.01").plus(fromAmount.times("0.00000001"));

/** Checks one transfer's amounts and works out its rates and USD values. */
export function transferAmounts(
  input: TransferAmountsInput,
): TransferAmounts | { error: string } {
  const { fromCode, toCode, fromAmount, fromFee, toAmount, toFee } = input;
  if (!fromAmount.greaterThan(0) || !twoDp(fromAmount)) {
    return { error: "Amount sent must be greater than 0 (up to 2 decimals)" };
  }
  if (!toAmount.greaterThan(0) || !twoDp(toAmount)) {
    return {
      error: "Amount received must be greater than 0 (up to 2 decimals)",
    };
  }
  if (fromFee.isNegative() || !twoDp(fromFee)) {
    return { error: "Sending bank fee must be 0 or more (up to 2 decimals)" };
  }
  if (toFee.isNegative() || !twoDp(toFee)) {
    return {
      error: "Receiving bank fee must be 0 or more (up to 2 decimals)",
    };
  }

  const sameCurrency = fromCode === toCode;
  let conversionRate: Decimal;
  if (sameCurrency) {
    conversionRate = new Decimal(1);
    if (!toAmount.equals(fromAmount)) {
      return {
        error:
          "Both sides use the same currency, so the amount received must equal the amount sent",
      };
    }
  } else {
    const r = input.conversionRate;
    if (!r || !r.greaterThan(0) || r.decimalPlaces() > 8) {
      return {
        error: "Bank conversion rate must be greater than 0 (up to 8 decimals)",
      };
    }
    conversionRate = r;
    if (
      fromAmount
        .times(r)
        .minus(toAmount)
        .abs()
        .greaterThan(receivedTolerance(fromAmount))
    ) {
      return {
        error: `Amount received must be the amount sent × the conversion rate (${cents(fromAmount.times(r)).toFixed(2)} ${toCode})`,
      };
    }
  }

  let amountUsd: Decimal;
  if (fromCode === USD) amountUsd = fromAmount;
  else if (toCode === USD) amountUsd = toAmount;
  else {
    const u = input.fromUsdRate;
    if (!u || !u.greaterThan(0) || u.decimalPlaces() > 8) {
      return {
        error: `USD rate must be greater than 0 (1 USD = X ${fromCode}, up to 8 decimals)`,
      };
    }
    amountUsd = cents(fromAmount.dividedBy(u));
  }
  if (!amountUsd.greaterThan(0)) {
    return { error: "The transfer is worth less than $0.01" };
  }

  // The rate of each side follows from the shared USD value.
  const fromExchangeRate =
    fromCode === USD ? new Decimal(1) : rate8(fromAmount.dividedBy(amountUsd));
  const toExchangeRate =
    toCode === USD ? new Decimal(1) : rate8(toAmount.dividedBy(amountUsd));

  return {
    conversionRate,
    fromExchangeRate,
    toExchangeRate,
    amountUsd,
    fromFeeUsd: cents(fromFee.times(amountUsd).dividedBy(fromAmount)),
    toFeeUsd: cents(toFee.times(amountUsd).dividedBy(toAmount)),
  };
}

/** A saved transfer with what its statement rows show. */
export interface TransferForRows {
  id: string;
  date: Date;
  createdAt: Date;
  fromBankId: string;
  toBankId: string;
  fromBankName: string;
  toBankName: string;
  fromEntityName: string;
  toEntityName: string;
  fromCode: string;
  toCode: string;
  fromAmount: Decimal;
  fromFee: Decimal;
  fromExchangeRate: Decimal;
  toAmount: Decimal;
  toFee: Decimal;
  toExchangeRate: Decimal;
  conversionRate: Decimal;
  amountUsd: Decimal;
  fromFeeUsd: Decimal;
  toFeeUsd: Decimal;
  reference: string | null;
  note: string | null;
  hasReceipt: boolean;
}

export const bankTransferReceiptHref = (id: string) =>
  `/api/accounting/bank-transfers/${id}/receipt`;

const bankStatementHref = (bankId: string) =>
  `/accounting/payment-accounts/banks/${bankId}`;

export const isInterCompany = (t: {
  fromEntityName: string;
  toEntityName: string;
}) => t.fromEntityName !== t.toEntityName;

/**
 * The rows of one transfer on the given banks' statements: the sending
 * bank's Credit (+ its fee), then the receiving bank's Debit (+ its fee).
 * A fee of 0 adds no row. Ids sort sending side first on a same-day tie.
 */
export function transferStatementRows(
  t: TransferForRows,
  bankIds: ReadonlySet<string>,
): StatementRow[] {
  const sameBank = t.fromBankId === t.toBankId;
  // The other side's name; the currency too when it's the same bank.
  const toLabel = sameBank ? `${t.toBankName} (${t.toCode})` : t.toBankName;
  const fromLabel = sameBank
    ? `${t.fromBankName} (${t.fromCode})`
    : t.fromBankName;
  const interCo = isInterCompany(t)
    ? `Inter-company: ${t.fromEntityName} → ${t.toEntityName}`
    : "";
  const rate =
    t.fromCode === t.toCode ? "" : ` @ ${t.conversionRate.toString()}`;
  const reference = t.reference ? `ref ${t.reference}` : "";
  const receiptHref = t.hasReceipt ? bankTransferReceiptHref(t.id) : null;
  const base = {
    source: "TRANSFER" as const,
    date: t.date,
    recordedAt: t.createdAt,
    invoices: [],
    invoiceAmountUsd: null,
    partial: false,
  };

  const rows: StatementRow[] = [];
  if (bankIds.has(t.fromBankId)) {
    const counterparty = {
      name: `To: ${toLabel}`,
      href: bankStatementHref(t.toBankId),
    };
    rows.push({
      ...base,
      id: `bt_${t.id}_a1`,
      bankId: t.fromBankId,
      invoiceType: "Internal Transfer",
      counterparty,
      side: "CREDIT",
      amountUsd: t.amountUsd,
      original: formatOriginal(t.fromAmount, t.fromCode, t.fromExchangeRate),
      note: joinNote(
        interCo,
        `received ${formatAmount(t.toAmount, t.toCode)}${rate}`,
        reference,
        t.note,
      ),
      receiptHref,
    });
    if (t.fromFee.greaterThan(0)) {
      rows.push({
        ...base,
        id: `bt_${t.id}_a2`,
        bankId: t.fromBankId,
        invoiceType: "Transfer Fee",
        counterparty,
        side: "CREDIT",
        amountUsd: t.fromFeeUsd,
        original: formatOriginal(t.fromFee, t.fromCode, t.fromExchangeRate),
        note: "Sending bank fee",
        receiptHref: null,
      });
    }
  }
  if (bankIds.has(t.toBankId)) {
    const counterparty = {
      name: `From: ${fromLabel}`,
      href: bankStatementHref(t.fromBankId),
    };
    rows.push({
      ...base,
      id: `bt_${t.id}_b1`,
      bankId: t.toBankId,
      invoiceType: "Internal Transfer",
      counterparty,
      side: "DEBIT",
      amountUsd: t.amountUsd,
      original: formatOriginal(t.toAmount, t.toCode, t.toExchangeRate),
      note: joinNote(
        interCo,
        `sent ${formatAmount(t.fromAmount, t.fromCode)}${rate}`,
        reference,
        t.note,
      ),
      receiptHref,
    });
    if (t.toFee.greaterThan(0)) {
      rows.push({
        ...base,
        id: `bt_${t.id}_b2`,
        bankId: t.toBankId,
        invoiceType: "Transfer Fee",
        counterparty,
        side: "CREDIT",
        amountUsd: t.toFeeUsd,
        original: formatOriginal(t.toFee, t.toCode, t.toExchangeRate),
        note: "Receiving bank fee",
        receiptHref: null,
      });
    }
  }
  return rows;
}
