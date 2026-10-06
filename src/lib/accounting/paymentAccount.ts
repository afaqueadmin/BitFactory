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

/**
 * D8: the payment, converted to USD, must equal the invoice total within
 * $0.01. Compares the unrounded conversion so rounding can't hide a gap.
 */
export function matchesInvoiceTotal(
  amount: Decimal,
  rate: Decimal,
  totalUsd: Decimal,
): boolean {
  return amount
    .dividedBy(rate)
    .minus(totalUsd)
    .abs()
    .lessThanOrEqualTo(PAYMENT_MATCH_TOLERANCE_USD);
}
