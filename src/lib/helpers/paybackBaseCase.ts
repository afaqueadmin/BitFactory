import { PaybackHistoryPoint } from "@/lib/helpers/paybackChartMapping";
import { FIXED_SCENARIO_PRICES } from "@/lib/helpers/paybackCalculations";
import {
  buildForecastBaseline,
  historyDayMs,
  OsVariant,
} from "@/lib/helpers/btcPriceForecast";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Post-halving "base case" for the Strategy 2 & 3 scenario tables.
 *
 * Those strategies project BTC over the machine's whole life, most of which
 * falls after the April 2028 halving. Each halving doubles the cost of mining
 * a BTC, so today's price levels aren't a realistic lifetime scenario.
 * Instead: scale today's mining cost by 2 per halving (x2 for 2028, x4 for
 * 2032), then add the average mining advantage (how far BTC traded above
 * that cost on the Buy vs Mine chart over the last year, or all available
 * history if shorter). The fixed scenario column nearest that price is the
 * base case.
 */

/** How many days of Buy vs Mine history the average advantage covers. */
export const BASE_CASE_LOOKBACK_DAYS = 365;

/**
 * Halvings with a base case, the mining cost multiple after each, and the
 * wording the payback tables use for them (column header + legend line).
 */
export const BASE_CASE_HALVINGS = [
  {
    year: 2028,
    costMultiplier: 2,
    shortLabel: "Base Case",
    label: "Cost-based Base case",
    description:
      "Production cost is assumed to be doubled after the 2028 halving, plus Bitcoin's trailing 12-month average mining premium.",
  },
  {
    year: 2032,
    costMultiplier: 4,
    shortLabel: "Prediction Case",
    label: "Cost-based Prediction case",
    description:
      "Production cost is assumed to be doubled AGAIN after the 2032 halving, plus Bitcoin's trailing 12-month average mining premium.",
  },
] as const;

/** Footnote under the payback tables explaining the lifetime BTC rows. */
export const LIFETIME_BTC_NOTE =
  "Lifetime Machine Revenue (BTC) is based on linear extrapolation on the current hash rewards + next (April 2028) BTC reward halving principle.";

export interface PaybackBaseCase {
  /** Average (price / cost - 1) over the lookback, e.g. 0.32 for +32%. */
  averageAdvantage: number;
  /** Days of history the average is based on. */
  historyDays: number;
  /** Today's mining cost (breakeven) the projection starts from. */
  currentCost: number;
  /** Today's cost scaled for the halving (x2 for 2028, x4 for 2032). */
  postHalvingCost: number;
  /** postHalvingCost plus the average advantage. */
  basePrice: number;
  /** Index into `scenarioPrices` of the column nearest `basePrice`. */
  scenarioIndex: number;
  scenarioPrice: number;
}

export interface MiningAdvantage {
  /** Average (price / cost - 1), e.g. 0.32 for +32%. */
  averageAdvantage: number;
  /** Days of history the average is based on. */
  historyDays: number;
}

/**
 * Average mining advantage — how far BTC traded above the selected OS's
 * breakeven — over the most recent BASE_CASE_LOOKBACK_DAYS of Buy vs Mine
 * history (or all of it, if shorter). Null when there's no usable history.
 */
export const calculateAverageMiningAdvantage = (
  history: PaybackHistoryPoint[],
  os: OsVariant,
): MiningAdvantage | null => {
  const latest = buildForecastBaseline(history, os);
  if (!latest) return null;

  const latestMs = historyDayMs(latest.date);
  const baseline = buildForecastBaseline(
    history.filter(
      (p) =>
        latestMs - historyDayMs(p.date) < BASE_CASE_LOOKBACK_DAYS * MS_PER_DAY,
    ),
    os,
  );
  const premium = baseline?.premiums.AVG_ALL;
  if (!baseline || premium == null || !Number.isFinite(premium)) return null;

  return { averageAdvantage: premium - 1, historyDays: baseline.historyDays };
};

/**
 * Builds the base case from today's mining cost and the Buy vs Mine history
 * for the selected miner/OS. Returns null when there's no usable history or
 * cost to work from.
 */
export const buildPaybackBaseCase = (
  currentCost: number,
  history: PaybackHistoryPoint[],
  os: OsVariant,
  scenarioPrices: number[] = FIXED_SCENARIO_PRICES,
  costMultiplier: number = BASE_CASE_HALVINGS[0].costMultiplier,
): PaybackBaseCase | null => {
  if (!Number.isFinite(currentCost) || currentCost <= 0) return null;
  if (scenarioPrices.length === 0) return null;

  const advantage = calculateAverageMiningAdvantage(history, os);
  if (!advantage) return null;

  const postHalvingCost = currentCost * costMultiplier;
  const basePrice = postHalvingCost * (1 + advantage.averageAdvantage);

  let scenarioIndex = 0;
  scenarioPrices.forEach((price, i) => {
    if (
      Math.abs(price - basePrice) <
      Math.abs(scenarioPrices[scenarioIndex] - basePrice)
    ) {
      scenarioIndex = i;
    }
  });

  return {
    ...advantage,
    currentCost,
    postHalvingCost,
    basePrice,
    scenarioIndex,
    scenarioPrice: scenarioPrices[scenarioIndex],
  };
};
