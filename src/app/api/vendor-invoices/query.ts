import { Prisma } from "@prisma/client";
import { parseDateParam, utcDayStart } from "@/lib/helpers/admin/tableExport";

/**
 * Shared query-parsing for the vendor invoice (Farm Tariffs) list, used by
 * both the JSON route (paginated) and the export route (unpaginated) so the
 * filter/sort logic can never drift between the two.
 */

const SORTABLE_FIELDS = [
  "invoiceNumber",
  "vendorName",
  "totalAmount",
  "paymentStatus",
  "billingDate",
  "paidDate",
  "dueDate",
  "createdAt",
];

/** vendorId filter value for Farm Tariffs with no vendor set. */
export const NO_VENDOR_FILTER = "none";

export interface ParsedVendorInvoiceQuery {
  where: Prisma.VendorInvoiceWhereInput;
  orderBy: Prisma.VendorInvoiceOrderByWithRelationInput[];
  /** Vendor filter as sent (an id or NO_VENDOR_FILTER), null when unset. */
  vendorId: string | null;
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
  const vendorId = searchParams.get("vendorId")?.trim() || null;
  const startDate = parseDateParam(searchParams.get("startDate"));
  const endDate = parseDateParam(searchParams.get("endDate"));

  const where: Record<string, unknown> = {};
  if (paymentStatus) {
    where.paymentStatus = paymentStatus;
  }
  if (vendorId) {
    where.vendorId = vendorId === NO_VENDOR_FILTER ? null : vendorId;
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
    // "vendorName" sorts by the vendor's name. id breaks ties (e.g. equal amounts) so rows keep a stable order across
    // table pages and match the export.
    orderBy: [
      sortBy === "vendorName"
        ? { vendor: { name: sortOrder } }
        : { [sortBy]: sortOrder },
      { id: "asc" },
    ],
    vendorId,
    startDate,
    endDate,
  };
}
