import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const MAX_MASTER_NAME_LENGTH = 150;

/** Bank shape returned by the banks API: its entity and linked currencies. */
export const bankInclude = {
  entity: { select: { id: true, name: true, isActive: true } },
  currencies: {
    include: {
      currency: {
        select: { id: true, code: true, name: true, isActive: true },
      },
    },
  },
} satisfies Prisma.AccountingBankInclude;

/** Uppercased currency code (2–10 letters or digits), or null if invalid. */
export function parseCurrencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{2,10}$/.test(code) ? code : null;
}

/** Validates a currencyIds payload: at least one, all existing. */
export async function parseCurrencyIds(
  value: unknown,
): Promise<{ ids: string[] } | { error: string }> {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((v) => typeof v === "string" && v)
  ) {
    return { error: "Select at least one currency" };
  }
  const ids = [...new Set(value as string[])];
  const found = await prisma.accountingCurrency.count({
    where: { id: { in: ids } },
  });
  if (found !== ids.length) {
    return { error: "One or more currencies were not found" };
  }
  return { ids };
}
