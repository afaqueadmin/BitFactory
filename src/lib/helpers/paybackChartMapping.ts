export interface PaybackHistoryPoint {
  date: string; // "YYYY-MM-DD" (UTC calendar day)
  btcPriceUsd: number;
  stockOsBreakeven: number;
  customOsBreakeven: number;
}

export interface PaybackChartSeriesPoint {
  date: string;
  dateLabel: string;
  btcPriceUsd: number;
  stockOsBreakeven: number;
  customOsBreakeven: number;
}

const toFiniteNumber = (value: unknown): number | null => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const formatDateLabel = (dateStr: string): string => {
  // Parse as a UTC date to avoid local-timezone day shifting.
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
};

/**
 * Shapes raw /api/payback-history rows into the fields the Recharts chart
 * needs, dropping any point with a non-finite value. Kept as a pure function
 * so it can be unit tested without rendering React.
 */
export const mapSnapshotsToChartSeries = (
  data: PaybackHistoryPoint[],
): PaybackChartSeriesPoint[] => {
  const points: PaybackChartSeriesPoint[] = [];

  for (const row of data ?? []) {
    if (!row || typeof row.date !== "string") continue;

    const btcPriceUsd = toFiniteNumber(row.btcPriceUsd);
    const stockOsBreakeven = toFiniteNumber(row.stockOsBreakeven);
    const customOsBreakeven = toFiniteNumber(row.customOsBreakeven);

    if (
      btcPriceUsd === null ||
      stockOsBreakeven === null ||
      customOsBreakeven === null
    ) {
      continue;
    }

    points.push({
      date: row.date,
      dateLabel: formatDateLabel(row.date),
      btcPriceUsd,
      stockOsBreakeven,
      customOsBreakeven,
    });
  }

  return points;
};
