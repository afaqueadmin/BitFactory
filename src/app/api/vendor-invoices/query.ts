import { Prisma } from "@prisma/client";
import { parseDateParam, utcDayStart } from "@/lib/helpers/admin/tableExport";

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
  /** Issued Date (billingDate) range as YYYY-MM-DD, null when unbounded. */
  startDate: string | null;
  endDate: string | null;
}

export function parseVendorInvoiceQuery(
  searchParams: URLSearchParams,
): ParsedVendorInvoiceQuery {
  const paymentStatus = searchParams.get("paymentStatus");
  const sortByParam = searchParams.get("sortBy");
  const sortOrderParam = searchParams.get("sortOrder");
  const startDate = parseDateParam(searchParams.get("startDate"));
  const endDate = parseDateParam(searchParams.get("endDate"));

  const where: Record<string, unknown> = {};
  if (paymentStatus) {
    where.paymentStatus = paymentStatus;
  }
  // billingDate is a @db.Date column (stored at UTC midnight), so the
  // range is an exact calendar-day match with no timezone involved.
  if (startDate || endDate) {
    where.billingDate = {
      ...(startDate ? { gte: utcDayStart(startDate) } : {}),
      ...(endDate ? { lte: utcDayStart(endDate) } : {}),
    };
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
    startDate,
    endDate,
  };
}
