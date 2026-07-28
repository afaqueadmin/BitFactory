import { Prisma } from "@prisma/client";

/**
 * Shared query-parsing for the Total Customer Balance drill-down, used by
 * both the JSON route (paginated) and the PDF export route (capped,
 * unpaginated) so the filters/sort/where-clause logic can never drift
 * between the two.
 */

export const SORT_FIELDS = new Set([
  "createdAt",
  "type",
  "amount",
  "narration",
  "customer",
  "invoiceNumber",
]);

export function buildOrderBy(
  sortBy: string,
  sortOrder: "asc" | "desc",
): Prisma.CostPaymentOrderByWithRelationInput {
  switch (sortBy) {
    case "type":
      return { type: sortOrder };
    case "amount":
      return { amount: sortOrder };
    case "narration":
      return { narration: sortOrder };
    case "customer":
      return { user: { name: sortOrder } };
    case "invoiceNumber":
      return { invoice: { invoiceNumber: sortOrder } };
    case "createdAt":
    default:
      return { createdAt: sortOrder };
  }
}

export interface ParsedCustomerBalanceQuery {
  sortBy: string;
  sortOrder: "asc" | "desc";
  where: Prisma.CostPaymentWhereInput;
  startDate: Date | null;
  endDate: Date | null;
}

export function parseCustomerBalanceQuery(
  url: URL,
): ParsedCustomerBalanceQuery {
  const sortByParam = url.searchParams.get("sortBy") || "createdAt";
  const sortOrderParam = url.searchParams.get("sortOrder");
  const sortOrder: "asc" | "desc" = sortOrderParam === "asc" ? "asc" : "desc";
  const sortBy = SORT_FIELDS.has(sortByParam) ? sortByParam : "createdAt";
  const typeParam = url.searchParams.get("type");
  const customerIdParam = url.searchParams.get("customerId")?.trim();
  const startDateParam = url.searchParams.get("startDate");
  const endDateParam = url.searchParams.get("endDate");

  // Unlike Monthly Revenue, this card has no fixed window to clamp to — the
  // card itself is all-time. So a date filter here only narrows if the
  // admin actually supplies one; with neither supplied, there's no
  // createdAt filter at all (matches the card's true all-time behavior).
  let startDate: Date | null = null;
  if (startDateParam) {
    const parsed = new Date(startDateParam);
    if (!isNaN(parsed.getTime())) {
      startDate = parsed;
    }
  }

  let endDate: Date | null = null;
  if (endDateParam) {
    const parsed = new Date(endDateParam);
    if (!isNaN(parsed.getTime())) {
      parsed.setHours(23, 59, 59, 999);
      endDate = parsed;
    }
  }

  const baseTypeFilter: Prisma.CostPaymentWhereInput["type"] =
    typeParam === "PAYMENT" ||
    typeParam === "ELECTRICITY_CHARGES" ||
    typeParam === "ADJUSTMENT"
      ? typeParam
      : { not: "HARDWARE_SALES" };

  const where: Prisma.CostPaymentWhereInput = {
    type: baseTypeFilter,
    isDeleted: false,
    // Excludes self-mining users - this drill-down mirrors the "Total
    // Customer Balance" dashboard card, which is hosted customers only.
    user: { isDeleted: false, segment: { not: "SELF_MINING" } },
    ...(customerIdParam ? { userId: customerIdParam } : {}),
    ...(startDate || endDate
      ? {
          createdAt: {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
          },
        }
      : {}),
  };

  return { sortBy, sortOrder, where, startDate, endDate };
}
