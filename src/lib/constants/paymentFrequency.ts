/**
 * Payout schedules a client can request via a PaymentFrequencyChangeRequest -
 * the values Luxor's payment-settings API uses for payment_frequency /
 * day_of_week (minus its UNSPECIFIED placeholder). Shared by the API routes
 * and the client-side request modal, so this file must stay free of
 * server-only imports.
 */

export const PAYMENT_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number];

export const DAYS_OF_WEEK = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export function isPaymentFrequency(value: unknown): value is PaymentFrequency {
  return (
    typeof value === "string" &&
    (PAYMENT_FREQUENCIES as readonly string[]).includes(value)
  );
}

export function isDayOfWeek(value: unknown): value is DayOfWeek {
  return (
    typeof value === "string" &&
    (DAYS_OF_WEEK as readonly string[]).includes(value)
  );
}

const properCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** "WEEKLY" + "MONDAY" -> "Weekly (Monday)"; "DAILY" -> "Daily". */
export function formatPaymentSchedule(
  frequency: string | null | undefined,
  dayOfWeek?: string | null,
): string {
  if (!frequency || frequency === "UNSPECIFIED") return "Not set";
  return frequency === "WEEKLY" && dayOfWeek
    ? `${properCase(frequency)} (${properCase(dayOfWeek)})`
    : properCase(frequency);
}
