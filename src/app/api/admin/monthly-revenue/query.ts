import { Prisma } from "@prisma/client";

/**
 * Shared query-parsing for the Monthly Revenue drill-down, used by both the
 * JSON route (paginated) and the PDF export route (capped, unpaginated) so
 * the filters/sort/where-clause logic can never drift between the two.
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

export interface ParsedMonthlyRevenueQuery {
  sortBy: string;
  sortOrder: "asc" | "desc";
  where: Prisma.CostPaymentWhereInput;
  effectiveStart: Date;
  effectiveEnd: Date;
}

export function parseMonthlyRevenueQuery(url: URL): ParsedMonthlyRevenueQuery {
  const sortByParam = url.searchParams.get("sortBy") || "createdAt";
  const sortOrderParam = url.searchParams.get("sortOrder");
  const sortOrder: "asc" | "desc" = sortOrderParam === "asc" ? "asc" : "desc";
  const sortBy = SORT_FIELDS.has(sortByParam) ? sortByParam : "createdAt";
  const typeParam = url.searchParams.get("type");
  const customerParam = url.searchParams.get("customer")?.trim();
  const startDateParam = url.searchParams.get("startDate");
  const endDateParam = url.searchParams.get("endDate");

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Date filter narrows within the mandatory 30-day window — it can never
  // widen it, so the itemized list can never drift outside the period the
  // card's own 30-day definition covers.
  let effectiveStart = thirtyDaysAgo;
  if (startDateParam) {
    const parsed = new Date(startDateParam);
    if (
      !isNaN(parsed.getTime()) &&
      parsed.getTime() > thirtyDaysAgo.getTime()
    ) {
      effectiveStart = parsed;
    }
  }

  let effectiveEnd = now;
  if (endDateParam) {
    const parsed = new Date(endDateParam);
    if (!isNaN(parsed.getTime())) {
      parsed.setHours(23, 59, 59, 999);
      if (parsed.getTime() < now.getTime()) {
        effectiveEnd = parsed;
      }
    }
  }

  const baseTypeFilter: Prisma.CostPaymentWhereInput["type"] =
    typeParam === "ELECTRICITY_CHARGES" || typeParam === "ADJUSTMENT"
      ? typeParam
      : { in: ["ELECTRICITY_CHARGES", "ADJUSTMENT"] };

  const where: Prisma.CostPaymentWhereInput = {
    type: baseTypeFilter,
    createdAt: { gte: effectiveStart, lte: effectiveEnd },
    ...(customerParam
      ? {
          user: {
            OR: [
              { name: { contains: customerParam, mode: "insensitive" } },
              { email: { contains: customerParam, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  return { sortBy, sortOrder, where, effectiveStart, effectiveEnd };
}
