import { PaybackHistoryPoint } from "@/lib/helpers/paybackChartMapping";
import { NEXT_HALVING_DATE } from "@/lib/helpers/paybackCalculations";

/**
 * BTC Price Predictor model.
 *
 * Every halving cuts the block reward in half, so the same machine running on
 * the same power mines half as much BTC per day - its breakeven production
 * cost per BTC doubles. Starting from today's breakeven (the same series the
 * "Buy BTC vs Mine BTC" chart plots), we project that cost forward one
 * doubling per halving, then multiply by the market premium BTC currently
 * trades at over that cost (spot / breakeven) to estimate the price.
 *
 * Deliberately simple: it holds network difficulty, power cost and fleet
 * efficiency constant. Rising difficulty would push the cost up further;
 * more efficient hardware would pull it down. Transaction fees don't halve,
 * so the true cost step is slightly under 2x.
 */

/** Current (post-April-2024) block subsidy. */
export const CURRENT_BLOCK_REWARD = 3.125;

/**
 * Estimated dates of the next five halvings. Each is 210,000 blocks (~4
 * years) after the last, so they're projected from NEXT_HALVING_DATE.
 */
export const HALVING_DATES: Date[] = [0, 1, 2, 3, 4].map(
  (i) =>
    new Date(
      Date.UTC(
        NEXT_HALVING_DATE.getUTCFullYear() + 4 * i,
        NEXT_HALVING_DATE.getUTCMonth(),
        NEXT_HALVING_DATE.getUTCDate(),
      ),
    ),
);

/**
 * Price can dip below production cost for a while (miner capitulation), but
 * not for long - so the low scenario never prices BTC under its cost.
 */
export const MIN_PREMIUM_FLOOR = 1;

export type OsVariant = "STOCK" | "CUSTOM";

export type PremiumBasis = "CURRENT" | "AVG_30D" | "AVG_90D" | "AVG_ALL";

export const PREMIUM_BASIS_LABELS: Record<PremiumBasis, string> = {
  CURRENT: "Today",
  AVG_30D: "30D avg",
  AVG_90D: "90D avg",
  AVG_ALL: "Full history avg",
};

const PREMIUM_BASIS_DAYS: Record<Exclude<PremiumBasis, "CURRENT">, number> = {
  AVG_30D: 30,
  AVG_90D: 90,
  AVG_ALL: Infinity,
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MS_PER_YEAR = MS_PER_DAY * 365.25;

/** UTC midnight of a history day. Tolerates full ISO timestamps; NaN if unparseable. */
export const historyDayMs = (date: string): number =>
  Date.parse(`${date.slice(0, 10)}T00:00:00Z`);

const toUtcMs = historyDayMs;

const breakevenOf = (point: PaybackHistoryPoint, os: OsVariant): number =>
  os === "CUSTOM" ? point.customOsBreakeven : point.stockOsBreakeven;

const isUsable = (point: PaybackHistoryPoint, os: OsVariant): boolean => {
  const cost = breakevenOf(point, os);
  return (
    Number.isFinite(point.btcPriceUsd) &&
    point.btcPriceUsd > 0 &&
    Number.isFinite(cost) &&
    cost > 0
  );
};

export interface ForecastBaseline {
  /** Latest day in the history. */
  date: string;
  /** Earliest usable day, so the UI can say how much history backs the averages. */
  firstDate: string;
  /** UTC ms of firstDate. */
  firstTimestamp: number;
  historyDays: number;
  btcPriceUsd: number;
  productionCost: number;
  /** Spot / breakeven, keyed by basis. Null when no history in that window. */
  premiums: Record<PremiumBasis, number | null>;
  /** Lowest / highest daily premium seen across the full history. */
  premiumLow: number;
  premiumHigh: number;
}

/**
 * Reduces the daily history to today's cost/price plus the market premium
 * over several lookback windows. Returns null when there's no usable data.
 */
export const buildForecastBaseline = (
  history: PaybackHistoryPoint[],
  os: OsVariant,
): ForecastBaseline | null => {
  const points = (history ?? [])
    .filter(
      (p) =>
        p &&
        typeof p.date === "string" &&
        Number.isFinite(toUtcMs(p.date)) &&
        isUsable(p, os),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length === 0) return null;

  const first = points[0];
  const latest = points[points.length - 1];
  const latestMs = toUtcMs(latest.date);
  const ratio = (p: PaybackHistoryPoint) => p.btcPriceUsd / breakevenOf(p, os);
  const ratios = points.map(ratio);

  const average = (days: number): number | null => {
    const window = points.filter(
      (p) => latestMs - toUtcMs(p.date) < days * MS_PER_DAY,
    );
    if (window.length === 0) return null;
    return window.reduce((sum, p) => sum + ratio(p), 0) / window.length;
  };

  return {
    date: latest.date,
    firstDate: first.date,
    firstTimestamp: toUtcMs(first.date),
    historyDays: Math.round((latestMs - toUtcMs(first.date)) / MS_PER_DAY) + 1,
    btcPriceUsd: latest.btcPriceUsd,
    productionCost: breakevenOf(latest, os),
    premiums: {
      CURRENT: ratio(latest),
      AVG_30D: average(PREMIUM_BASIS_DAYS.AVG_30D),
      AVG_90D: average(PREMIUM_BASIS_DAYS.AVG_90D),
      AVG_ALL: average(PREMIUM_BASIS_DAYS.AVG_ALL),
    },
    premiumLow: Math.min(...ratios),
    premiumHigh: Math.max(...ratios),
  };
};

export interface ForecastRow {
  /** "Today" for the baseline row, otherwise the halving year. */
  label: string;
  year: number;
  /** UTC ms of the row's date - lets the chart space points by real time. */
  timestamp: number;
  /** Halvings from today (0 for the baseline row). */
  halvings: number;
  blockReward: number;
  productionCost: number;
  predictedPrice: number;
  /** Price at the low / high end of the observed premium range. */
  priceLow: number;
  priceHigh: number;
  /** predictedPrice / today's spot price. */
  multipleOfToday: number;
  /** Compound annual growth from today's spot to predictedPrice (null today). */
  annualGrowth: number | null;
}

/**
 * Today's row plus one row per halving: cost doubles each halving and the
 * predicted price is that cost times `premium`, with a low/high band from
 * the observed premium range. The baseline row shows the actual spot price
 * rather than cost × premium.
 */
export const buildHalvingForecast = (
  baseline: Pick<
    ForecastBaseline,
    "date" | "btcPriceUsd" | "productionCost" | "premiumLow" | "premiumHigh"
  >,
  premium: number,
): ForecastRow[] => {
  const baseMs = toUtcMs(baseline.date);
  const low = Math.max(
    MIN_PREMIUM_FLOOR,
    Math.min(baseline.premiumLow, premium),
  );
  const high = Math.max(baseline.premiumHigh, premium);

  const rows: ForecastRow[] = [
    {
      label: "Today",
      year: Number(baseline.date.slice(0, 4)),
      timestamp: baseMs,
      halvings: 0,
      blockReward: CURRENT_BLOCK_REWARD,
      productionCost: baseline.productionCost,
      predictedPrice: baseline.btcPriceUsd,
      priceLow: baseline.btcPriceUsd,
      priceHigh: baseline.btcPriceUsd,
      multipleOfToday: 1,
      annualGrowth: null,
    },
  ];

  HALVING_DATES.forEach((date, index) => {
    const halvings = index + 1;
    const factor = 2 ** halvings;
    const productionCost = baseline.productionCost * factor;
    const predictedPrice = productionCost * premium;
    const multipleOfToday = predictedPrice / baseline.btcPriceUsd;
    const years = (date.getTime() - baseMs) / MS_PER_YEAR;
    rows.push({
      label: String(date.getUTCFullYear()),
      year: date.getUTCFullYear(),
      timestamp: date.getTime(),
      halvings,
      blockReward: CURRENT_BLOCK_REWARD / factor,
      productionCost,
      predictedPrice,
      priceLow: productionCost * low,
      priceHigh: productionCost * high,
      multipleOfToday,
      annualGrowth: years > 0 ? multipleOfToday ** (1 / years) - 1 : null,
    });
  });

  return rows;
};
