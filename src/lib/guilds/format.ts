/** Display helpers for the guild pages. Dependency-free (client-safe). */

/** Distribution status -> Daylight pill tone. */
export function distributionTone(
  status: string,
): "warning" | "info" | "success" | "danger" | "neutral" {
  switch (status) {
    case "CALCULATED":
    case "QUEUED":
    case "BROADCAST":
      return "info";
    case "HELD":
      return "warning";
    case "SETTLED":
      return "success";
    case "FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

export const distributionStatusLabel = (status: string) =>
  ({
    CALCULATED: "Ready to send",
    HELD: "On hold",
    QUEUED: "Sending",
    BROADCAST: "Sent, confirming",
    SETTLED: "Sent",
    FAILED: "Failed",
  })[status] ?? status;

/** "October 2026" from a UTC first-of-month date. */
export const formatMonth = (value: string | Date) =>
  new Date(value).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
  });

export const formatUsd = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const formatBtc = (value: number | string) =>
  `${Number(value).toFixed(8)} BTC`;

/** "2026-10" for the previous month, the usual reward month to run. */
export function previousMonthKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
