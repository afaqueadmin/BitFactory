export type PaybackOsFilter = "STOCK" | "CUSTOM" | "COMPARISON";

const OS_LABELS: Record<Exclude<PaybackOsFilter, "COMPARISON">, string> = {
  STOCK: "Stock OS",
  CUSTOM: "Custom OS",
};

/**
 * Builds a graph heading that reflects the currently active miner/OS
 * filters, e.g. "Cost to Mine vs Buy BTC — S21 Pro · Custom OS". The miner
 * filter is always active (there's no "all miners" state), so it's always
 * shown; the OS filter only narrows the view when it's STOCK or CUSTOM —
 * COMPARISON shows both OS lines, so it's the "no filter applied" default
 * and adds no suffix.
 */
export const buildPaybackChartHeading = (
  baseTitle: string,
  minerLabel: string,
  osFilter: PaybackOsFilter,
): string => {
  const parts = [minerLabel];
  if (osFilter !== "COMPARISON") {
    parts.push(OS_LABELS[osFilter]);
  }

  return parts.length > 0 ? `${baseTitle} — ${parts.join(" · ")}` : baseTitle;
};
