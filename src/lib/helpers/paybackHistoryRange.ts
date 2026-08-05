export type PaybackHistoryRange = "30D" | "90D" | "1Y" | "ALL";

export const PAYBACK_HISTORY_RANGES: PaybackHistoryRange[] = [
  "30D",
  "90D",
  "1Y",
  "ALL",
];

const RANGE_DAYS: Record<Exclude<PaybackHistoryRange, "ALL">, number> = {
  "30D": 30,
  "90D": 90,
  "1Y": 365,
};

export const isPaybackHistoryRange = (
  value: string | null,
): value is PaybackHistoryRange =>
  value !== null && (PAYBACK_HISTORY_RANGES as string[]).includes(value);

/**
 * Returns the UTC-midnight inclusive lower bound for a given range, or null
 * for "ALL" (no lower bound). `now` is injectable for deterministic tests.
 */
export const getRangeStartDate = (
  range: PaybackHistoryRange,
  now: Date = new Date(),
): Date | null => {
  if (range === "ALL") return null;

  const days = RANGE_DAYS[range];
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
};
