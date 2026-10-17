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
 * falls after the April 2028 halving. The halving doubles the cost of mining
 * a BTC, so today's price levels aren't a realistic lifetime scenario.
 * Instead: double today's mining cost, then add the average mining advantage
 * (how far BTC traded above that cost on the Buy vs Mine chart over the last
 * year, or all available history if shorter). The fixed scenario column
 * nearest that price is the base case.
 */

/** How many days of Buy vs Mine history the average advantage covers. */
export const BASE_CASE_LOOKBACK_DAYS = 365;

/** Mining cost multiplier at the next halving (block reward halves). */
export const HALVING_COST_MULTIPLIER = 2;

export interface PaybackBaseCase {
  /** Average (price / cost - 1) over the lookback, e.g. 0.32 for +32%. */
  averageAdvantage: number;
  /** Days of history the average is based on. */
  historyDays: number;
  /** Today's mining cost (breakeven) the projection starts from. */
  currentCost: number;
  /** Today's cost doubled for the halving. */
  postHalvingCost: number;
  /** postHalvingCost plus the average advantage. */
  basePrice: number;
  /** Index into `scenarioPrices` of the column nearest `basePrice`. */
  scenarioIndex: number;
  scenarioPrice: number;
}

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
): PaybackBaseCase | null => {
  if (!Number.isFinite(currentCost) || currentCost <= 0) return null;
  if (scenarioPrices.length === 0) return null;

  const latest = buildForecastBaseline(history, os);
  if (!latest) return null;

  // Keep only the most recent BASE_CASE_LOOKBACK_DAYS before averaging.
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

  const postHalvingCost = currentCost * HALVING_COST_MULTIPLIER;
  const basePrice = postHalvingCost * premium;

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
    averageAdvantage: premium - 1,
    historyDays: baseline.historyDays,
    currentCost,
    postHalvingCost,
    basePrice,
    scenarioIndex,
    scenarioPrice: scenarioPrices[scenarioIndex],
  };
};
