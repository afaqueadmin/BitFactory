import { Prisma, VendorName, VendorPaymentStatus } from "@prisma/client";
import { parseDateParam, utcDayStart } from "@/lib/helpers/admin/tableExport";

/**
 * Shared query-parsing for the hardware purchase invoice list, used by both
 * the JSON route (paginated) and the export route (unpaginated) so the
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

export interface ParsedHardwarePurchaseQuery {
  where: Prisma.HardwarePurchaseInvoiceWhereInput;
  orderBy: Prisma.HardwarePurchaseInvoiceOrderByWithRelationInput[];
  /** The filters actually applied, for the export's PDF subtitle. */
  filters: {
    vendorName: VendorName | null;
    hardware: string | null;
    paymentStatus: VendorPaymentStatus | null;
    startDate: string | null;
    endDate: string | null;
  };
}

const isEnumValue = <T extends string>(
  values: Record<string, T>,
  value: string | null,
): value is T => value !== null && Object.values(values).includes(value as T);

export function parseHardwarePurchaseQuery(
  searchParams: URLSearchParams,
): ParsedHardwarePurchaseQuery {
  const paymentStatusParam = searchParams.get("paymentStatus");
  const vendorNameParam = searchParams.get("vendorName");
  const sortByParam = searchParams.get("sortBy");
  const sortOrderParam = searchParams.get("sortOrder");

  const paymentStatus = isEnumValue(VendorPaymentStatus, paymentStatusParam)
    ? paymentStatusParam
    : null;
  const vendorName = isEnumValue(VendorName, vendorNameParam)
    ? vendorNameParam
    : null;
  const hardware = searchParams.get("hardware")?.trim() || null;
  const startDate = parseDateParam(searchParams.get("startDate"));
  const endDate = parseDateParam(searchParams.get("endDate"));

  const where: Prisma.HardwarePurchaseInvoiceWhereInput = {
    ...(paymentStatus ? { paymentStatus } : {}),
    ...(vendorName ? { vendorName } : {}),
    // Hardware is a free-text description, so match any part of it.
    ...(hardware
      ? { hardwareDescription: { contains: hardware, mode: "insensitive" } }
      : {}),
    // billingDate is a @db.Date column (stored at UTC midnight), so the
    // range is an exact calendar-day match with no timezone involved.
    ...(startDate || endDate
      ? {
          billingDate: {
            ...(startDate ? { gte: utcDayStart(startDate) } : {}),
            ...(endDate ? { lte: utcDayStart(endDate) } : {}),
          },
        }
      : {}),
  };

  const sortBy = SORTABLE_FIELDS.includes(sortByParam || "")
    ? (sortByParam as string)
    : "createdAt";
  const sortOrder = sortOrderParam === "asc" ? "asc" : "desc";

  return {
    where,
    // id breaks ties (e.g. equal amounts) so rows keep a stable order across
    // table pages and match the export.
    orderBy: [{ [sortBy]: sortOrder }, { id: "asc" }],
    filters: { vendorName, hardware, paymentStatus, startDate, endDate },
  };
}
