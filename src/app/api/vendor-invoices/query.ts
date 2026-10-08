import { Prisma } from "@prisma/client";

/**
 * Shared query-parsing for the vendor invoice (Farm Tariffs) list, used by
 * both the JSON route (paginated) and the export route (unpaginated) so the
 * filter/sort logic can never drift between the two.
 */

const SORTABLE_FIELDS = [
  "invoiceNumber",
  "totalAmount",
  "paymentStatus",
  "billingDate",
  "paidDate",
  "dueDate",
  "createdAt",
];

export interface ParsedVendorInvoiceQuery {
  where: Prisma.VendorInvoiceWhereInput;
  orderBy: Prisma.VendorInvoiceOrderByWithRelationInput[];
}

export function parseVendorInvoiceQuery(
  searchParams: URLSearchParams,
): ParsedVendorInvoiceQuery {
  const paymentStatus = searchParams.get("paymentStatus");
  const sortByParam = searchParams.get("sortBy");
  const sortOrderParam = searchParams.get("sortOrder");

  const where: Record<string, unknown> = {};
  if (paymentStatus) {
    where.paymentStatus = paymentStatus;
  }

  const sortBy = SORTABLE_FIELDS.includes(sortByParam || "")
    ? (sortByParam as string)
    : "createdAt";
  const sortOrder = sortOrderParam === "asc" ? "asc" : "desc";

  return {
    where: where as Prisma.VendorInvoiceWhereInput,
    // id breaks ties (e.g. equal amounts) so rows keep a stable order across
    // table pages and match the export.
    orderBy: [{ [sortBy]: sortOrder }, { id: "asc" }],
  };
}
