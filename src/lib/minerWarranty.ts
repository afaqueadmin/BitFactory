/**
 * Miner manufacturer warranty helpers.
 *
 * Miner.warrantyExpiresAt is a Postgres DATE (`@db.Date`), which Prisma
 * returns as midnight UTC and JSON serialises as "YYYY-MM-DDT00:00:00.000Z".
 * Everything here works on the UTC calendar date so the shown day never
 * shifts with the viewer's timezone.
 */

/** A warranty ending within this many days counts as "expiring soon". */
export const WARRANTY_EXPIRING_DAYS = 90;

export type WarrantyStatus = "ACTIVE" | "EXPIRING" | "EXPIRED" | "NONE";

export const WARRANTY_STATUS_LABEL: Record<WarrantyStatus, string> = {
  ACTIVE: "In warranty",
  EXPIRING: "Expiring soon",
  EXPIRED: "Expired",
  NONE: "Not recorded",
};

type WarrantyValue = string | Date | null | undefined;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight UTC of the value's UTC calendar day, or null if unset/invalid. */
function utcDay(value: WarrantyValue): number | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (isNaN(time)) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Warranty status relative to today. The expiry day itself is still
 * covered, so a warranty is EXPIRED only from the day after.
 */
export function getWarrantyStatus(
  expiresAt: WarrantyValue,
  now: Date = new Date(),
): WarrantyStatus {
  const expiryDay = utcDay(expiresAt);
  if (expiryDay === null) return "NONE";
  const today = utcDay(now)!;
  const daysLeft = Math.round((expiryDay - today) / DAY_MS);
  if (daysLeft < 0) return "EXPIRED";
  if (daysLeft <= WARRANTY_EXPIRING_DAYS) return "EXPIRING";
  return "ACTIVE";
}

/** e.g. "Mar 5, 2027", or "—" when not recorded. */
export function formatWarrantyDate(value: WarrantyValue): string {
  const day = utcDay(value);
  if (day === null) return "—";
  return new Date(day).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "YYYY-MM-DD" for an `<input type="date">`, or "" when not recorded. */
export function toDateInputValue(value: WarrantyValue): string {
  const day = utcDay(value);
  if (day === null) return "";
  return new Date(day).toISOString().slice(0, 10);
}

/**
 * Parse a warrantyExpiresAt value from an API request body.
 * - "YYYY-MM-DD" (a real calendar date) -> Date at midnight UTC
 * - "" or null -> null (clears the date)
 * - anything else -> "invalid"
 */
export function parseWarrantyDateInput(
  value: unknown,
): Date | null | "invalid" {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const match = DATE_ONLY_RE.exec(value.trim());
  if (!match) return "invalid";
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Rejects dates like 2027-02-30 that Date.UTC would roll over.
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return "invalid";
  }
  return date;
}

export const WARRANTY_DATE_ERROR =
  "warrantyExpiresAt must be a valid date (YYYY-MM-DD)";
