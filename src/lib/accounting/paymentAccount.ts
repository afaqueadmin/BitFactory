import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

/** Largest gap allowed between the converted payment and the invoice total (D8). */
export const PAYMENT_MATCH_TOLERANCE_USD = new Decimal("0.01");

/**
 * Checks a payment's Entity -> Bank -> Currency selection: all three exist
 * and are active, the bank belongs to the entity, and the bank holds the
 * currency. Returns the currency code on success.
 */
export async function validatePaymentAccount({
  entityId,
  bankId,
  currencyId,
}: {
  entityId: unknown;
  bankId: unknown;
  currencyId: unknown;
}): Promise<
  | { currencyCode: string; entityName: string; bankName: string }
  | { error: string }
> {
  if (
    typeof entityId !== "string" ||
    !entityId ||
    typeof bankId !== "string" ||
    !bankId ||
    typeof currencyId !== "string" ||
    !currencyId
  ) {
    return { error: "Entity, bank and currency are required" };
  }

  const bank = await prisma.accountingBank.findUnique({
    where: { id: bankId },
    include: {
      entity: { select: { id: true, name: true, isActive: true } },
      currencies: {
        where: { currencyId },
        include: { currency: { select: { code: true, isActive: true } } },
      },
    },
  });

  if (!bank || !bank.isActive) {
    return { error: "The selected bank is not available" };
  }
  if (bank.entityId !== entityId || !bank.entity.isActive) {
    return {
      error: "The selected bank does not belong to the selected entity",
    };
  }
  const link = bank.currencies[0];
  if (!link || !link.currency.isActive) {
    return { error: "The selected bank does not hold the selected currency" };
  }

  return {
    currencyCode: link.currency.code,
    entityName: bank.entity.name,
    bankName: bank.name,
  };
}

/**
 * Parses a positive (or, with allowZero, non-negative) decimal from a request
 * body. Accepts numbers or numeric strings; returns null when invalid.
 */
export function parseDecimal(
  value: unknown,
  { allowZero = false }: { allowZero?: boolean } = {},
): Decimal | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\s*\d+(\.\d+)?\s*$/.test(value)) {
    return null;
  }
  let parsed: Decimal;
  try {
    parsed = new Decimal(typeof value === "string" ? value.trim() : value);
  } catch {
    return null;
  }
  if (!parsed.isFinite() || parsed.isNegative()) return null;
  if (!allowZero && parsed.isZero()) return null;
  return parsed;
}

/** amount ÷ rate (rate is 1 USD = X currency), rounded to cents. */
export function toUsd(amount: Decimal, rate: Decimal): Decimal {
  return amount.dividedBy(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Σ amount ÷ rate over the parts, unrounded. */
export function partsUsdUnrounded(
  parts: { amount: Decimal; rate: Decimal }[],
): Decimal {
  return parts.reduce(
    (sum, p) => sum.plus(p.amount.dividedBy(p.rate)),
    new Decimal(0),
  );
}

/**
 * Σ fee ÷ rate over the parts, unrounded. Vendor-side fees are in each
 * part's currency and must be covered by its amount, so they add to the
 * USD the parts have to reach.
 */
export function feesUsdUnrounded(
  parts: { fee: Decimal; rate: Decimal }[],
): Decimal {
  return parts.reduce(
    (sum, p) => sum.plus(p.fee.dividedBy(p.rate)),
    new Decimal(0),
  );
}

/**
 * D8: the payment, converted to USD, must equal the invoice total within
 * $0.01. A multi-currency payment is checked on the sum of its parts.
 * Compares the unrounded conversion so rounding can't hide a gap.
 */
export function matchesInvoiceTotal(
  parts: { amount: Decimal; rate: Decimal }[],
  totalUsd: Decimal,
): boolean {
  return partsUsdUnrounded(parts)
    .minus(totalUsd)
    .abs()
    .lessThanOrEqualTo(PAYMENT_MATCH_TOLERANCE_USD);
}

/** Most currency parts one payment (or one section of it) may have. */
export const MAX_PAYMENT_PARTS = 10;

/**
 * One currency part of a payment as sent by the record-payment forms:
 * where it was received, the rate (1 USD = X currency) and the amount in
 * that currency, all as typed text.
 */
export interface PaymentPartRequest {
  entityId?: unknown;
  bankId?: unknown;
  currencyId?: unknown;
  exchangeRate?: unknown;
  amount?: unknown;
}

/** A validated payment part. */
export interface ParsedPaymentPart {
  entityId: string;
  bankId: string;
  currencyId: string;
  currencyCode: string;
  entityName: string;
  bankName: string;
  rate: Decimal;
  /** In the part's currency. */
  amount: Decimal;
  /** amount ÷ rate, rounded to cents. */
  usd: Decimal;
}

/**
 * Validates the currency parts of a payment: 1 to MAX_PAYMENT_PARTS parts,
 * each with a valid Entity -> Bank -> Currency, a rate > 0 (1 for USD, up
 * to 8 decimal places) and an amount with up to 2 decimal places (> 0, or
 * >= 0 with allowZeroAmount). The same currency may appear more than once.
 * Errors name the part ("Part 2: ...") when there is more than one.
 */
export async function parsePaymentParts(
  raw: unknown,
  { allowZeroAmount = false }: { allowZeroAmount?: boolean } = {},
): Promise<{ parts: ParsedPaymentPart[] } | { error: string }> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "Add at least one currency part to the payment" };
  }
  if (raw.length > MAX_PAYMENT_PARTS) {
    return {
      error: `A payment can have at most ${MAX_PAYMENT_PARTS} currency parts`,
    };
  }

  const parts: ParsedPaymentPart[] = [];
  for (const [i, item] of raw.entries()) {
    const prefix = raw.length > 1 ? `Part ${i + 1}: ` : "";
    const part = (item ?? {}) as PaymentPartRequest;

    const account = await validatePaymentAccount({
      entityId: part.entityId,
      bankId: part.bankId,
      currencyId: part.currencyId,
    });
    if ("error" in account) return { error: prefix + account.error };

    const rate = parseDecimal(part.exchangeRate);
    if (!rate || rate.decimalPlaces() > 8) {
      return {
        error:
          prefix +
          "Exchange rate must be greater than 0 (up to 8 decimal places)",
      };
    }
    if (account.currencyCode === "USD" && !rate.equals(1)) {
      return { error: prefix + "USD payments must use an exchange rate of 1" };
    }

    // A blank amount counts as 0 where zero is allowed (Mark as Paid).
    const amount =
      allowZeroAmount &&
      (part.amount === undefined || part.amount === null || part.amount === "")
        ? new Decimal(0)
        : parseDecimal(part.amount, { allowZero: allowZeroAmount });
    if (!amount || amount.decimalPlaces() > 2) {
      return {
        error:
          prefix +
          (allowZeroAmount
            ? "Amount must be 0 or more, with up to 2 decimal places"
            : "Amount paid must be greater than 0 (up to 2 decimal places)"),
      };
    }

    parts.push({
      // validatePaymentAccount has checked these are non-empty strings.
      entityId: part.entityId as string,
      bankId: part.bankId as string,
      currencyId: part.currencyId as string,
      currencyCode: account.currencyCode,
      entityName: account.entityName,
      bankName: account.bankName,
      rate,
      amount,
      usd: toUsd(amount, rate),
    });
  }

  return { parts };
}

/** A part as written to an audit log entry. */
export const auditPart = (p: ParsedPaymentPart) => ({
  entity: p.entityName,
  bank: p.bankName,
  currency: p.currencyCode,
  exchangeRate: p.rate.toString(),
  originalAmount: p.amount.toString(),
  usd: p.usd.toString(),
});
