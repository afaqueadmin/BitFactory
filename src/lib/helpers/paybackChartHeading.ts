export type PaybackOsFilter = "STOCK" | "CUSTOM";

const OS_LABELS: Record<PaybackOsFilter, string> = {
  STOCK: "Stock OS",
  CUSTOM: "Custom OS",
};

/**
 * Builds a graph heading that reflects the currently active miner/OS
 * filters, e.g. "Buy BTC vs Mine BTC — S21 Pro · Custom OS". Both filters
 * are always active (there's no "all miners" or "all OS" state), so both
 * are always shown.
 */
export const buildPaybackChartHeading = (
  baseTitle: string,
  minerLabel: string,
  osFilter: PaybackOsFilter,
): string => {
  const parts = [minerLabel, OS_LABELS[osFilter]];

  return `${baseTitle} — ${parts.join(" · ")}`;
};
