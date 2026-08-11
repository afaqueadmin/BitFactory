export type MinerModel = "S21PRO" | "S21XP";

export const MINER_LABELS: Record<MinerModel, string> = {
  S21PRO: "S21 Pro",
  S21XP: "S21 XP",
};

// Fallback constants (only used if live price/reward APIs fail)
export const FALLBACK_BTC_PRICE = 67953.35; // USD
export const FALLBACK_REWARD_BTC_PER_PH_DAY = 0.00044827;

// Scenario BTC prices (fixed steps; breakeven price comes from DB separately)
export const FIXED_SCENARIO_PRICES = [
  100000, 125000, 150000, 200000, 250000, 300000, 350000,
];

export interface CalculationValues {
  dailyBtcStock: number;
  dailyBtcLux: number;
  monthlyRevenueStock: number;
  monthlyRevenueLux: number;
  netRevenueStock: number;
  netRevenueLux: number;
  paybackMonthsStock: number;
  paybackMonthsLux: number;
}

export const thToPh = (th: number): number => th / 1000;

export const calculateDailyBtc = (
  hashrateTh: number,
  rewardBtcPerPhDay: number,
  poolCommission: number,
): number => {
  const hashratePh = thToPh(hashrateTh);
  return hashratePh * rewardBtcPerPhDay * (1 - poolCommission / 100);
};

export const calculateMonthlyRevenue = (
  dailyBtc: number,
  btcPrice: number,
): number => {
  return (dailyBtc * btcPrice * 365) / 12;
};

export const calculateNetRevenue = (
  monthlyRevenue: number,
  monthlyElectricityHosting: number,
): number => {
  return monthlyRevenue - monthlyElectricityHosting;
};

export const calculatePaybackMonths = (
  netRevenue: number,
  machineCost: number,
): number => {
  if (netRevenue <= 0) return Infinity;
  return machineCost / netRevenue;
};

export const calculateBreakevenBtcPrice = (
  monthlyElectricityHosting: number,
  rewardBtcPerPhDay: number,
  hashrateTh: number,
  poolCommission: number,
  fallbackPrice: number,
): number => {
  try {
    const hashratePh = thToPh(hashrateTh);
    const denominator =
      rewardBtcPerPhDay * hashratePh * (1 - poolCommission / 100) * (365 / 12);

    if (denominator <= 0) return fallbackPrice;
    return monthlyElectricityHosting / denominator;
  } catch {
    return fallbackPrice;
  }
};

// Strategy 2: machine's bills are paid from an outside funding source (not
// by selling mined BTC), so BTC accumulates untouched over a fixed machine
// life and the whole thing is evaluated as a lump-sum return at the end.
export const MACHINE_LIFE_YEARS = 5;

// Strategy 3: same lump-sum-at-end-of-life model as Strategy 2, except the
// bills are funded via a loan collateralized by the accumulating BTC rather
// than an outside funding source. That borrowing is not free, so Strategy 3
// carries its accrued interest as a real cost (see calculateStrategy3Values).
export const BORROWING_RATE_APR = 4; // % — USDT/(BTC Collateral) borrowing rate

// Next scheduled Bitcoin block-reward halving, which cuts mining output in
// half. Any lifetime BTC projection spanning this date must apply the
// reduced rate to the days on/after it.
export const NEXT_HALVING_DATE = new Date(Date.UTC(2028, 3, 13));

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const toUtcMidnight = (date: Date): number =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

const daysBetween = (start: Date, end: Date): number =>
  Math.max(
    0,
    Math.round((toUtcMidnight(end) - toUtcMidnight(start)) / MS_PER_DAY),
  );

// Projects lifetime BTC production for a machine over its life, halving the
// daily rate for whichever portion of that life falls on/after the next
// halving date.
export const calculateLifetimeBtc = (
  dailyBtc: number,
  startDate: Date,
  machineLifeYears: number = MACHINE_LIFE_YEARS,
  halvingDate: Date = NEXT_HALVING_DATE,
): number => {
  const lifespanEnd = new Date(startDate);
  lifespanEnd.setFullYear(lifespanEnd.getFullYear() + machineLifeYears);

  const totalDays = daysBetween(startDate, lifespanEnd);

  if (toUtcMidnight(halvingDate) <= toUtcMidnight(startDate)) {
    // Halving already in effect for the machine's entire life.
    return dailyBtc * 0.5 * totalDays;
  }
  if (toUtcMidnight(halvingDate) >= toUtcMidnight(lifespanEnd)) {
    // Halving occurs after the machine's life ends — no reduction applies.
    return dailyBtc * totalDays;
  }

  const daysBeforeHalving = daysBetween(startDate, halvingDate);
  const daysAfterHalving = daysBetween(halvingDate, lifespanEnd);

  return dailyBtc * daysBeforeHalving + dailyBtc * 0.5 * daysAfterHalving;
};

export interface Strategy2Values extends CalculationValues {
  lifetimeBtcStock: number;
  lifetimeBtcLux: number;
  lifetimeRevenueStock: number;
  lifetimeRevenueLux: number;
  lifetimeElectricityHostingCharges: number;
  machineDepreciation: number;
  netProfitLifetimeStock: number;
  netProfitLifetimeLux: number;
  returnMultipleStock: number;
  returnMultipleLux: number;
  roiLifetimeStock: number;
  roiLifetimeLux: number;
  roiPerYearStock: number;
  roiPerYearLux: number;
}

export const calculateAllValues = (
  btcPrice: number,
  rewardBtcPerPhDay: number,
  hashrateStockOs: number,
  hashrateLuxos: number,
  poolCommissionStockOs: number,
  poolCommissionLuxos: number,
  monthlyElectricityHosting: number,
  machineCost: number,
): CalculationValues => {
  const dailyBtcStock = calculateDailyBtc(
    hashrateStockOs,
    rewardBtcPerPhDay,
    poolCommissionStockOs,
  );
  const dailyBtcLux = calculateDailyBtc(
    hashrateLuxos,
    rewardBtcPerPhDay,
    poolCommissionLuxos,
  );

  const monthlyRevenueStock = calculateMonthlyRevenue(dailyBtcStock, btcPrice);
  const monthlyRevenueLux = calculateMonthlyRevenue(dailyBtcLux, btcPrice);

  const netRevenueStock = calculateNetRevenue(
    monthlyRevenueStock,
    monthlyElectricityHosting,
  );
  const netRevenueLux = calculateNetRevenue(
    monthlyRevenueLux,
    monthlyElectricityHosting,
  );

  const paybackMonthsStock = calculatePaybackMonths(
    netRevenueStock,
    machineCost,
  );
  const paybackMonthsLux = calculatePaybackMonths(netRevenueLux, machineCost);

  return {
    dailyBtcStock,
    dailyBtcLux,
    monthlyRevenueStock,
    monthlyRevenueLux,
    netRevenueStock,
    netRevenueLux,
    paybackMonthsStock,
    paybackMonthsLux,
  };
};

export interface Strategy3Values extends Strategy2Values {
  loanPrincipal: number;
  loanInterest: number;
  loanBalanceAtEnd: number;
  borrowingRateApr: number;
}

/**
 * Interest accrued on the loan that funds the machine's bills under Strategy 3.
 *
 * Each month one bill is drawn on the facility, so the balance builds up over
 * the machine's life rather than being borrowed as a lump sum on day one.
 * Nothing is repaid until the BTC is sold at the end, so the interest
 * capitalises onto the balance and itself accrues — which is why this is
 * meaningfully larger than a flat `principal x rate x years`.
 */
export const calculateLoanInterest = (
  monthlyBorrowed: number,
  aprPercent: number = BORROWING_RATE_APR,
  machineLifeYears: number = MACHINE_LIFE_YEARS,
): number => {
  if (monthlyBorrowed <= 0 || aprPercent <= 0) return 0;

  const monthlyRate = aprPercent / 100 / 12;
  const months = machineLifeYears * 12;

  let balance = 0;
  let interest = 0;

  for (let month = 0; month < months; month++) {
    balance += monthlyBorrowed;
    const accrued = balance * monthlyRate;
    interest += accrued;
    balance += accrued;
  }

  return interest;
};

export const calculateStrategy2Values = (
  btcPrice: number,
  rewardBtcPerPhDay: number,
  hashrateStockOs: number,
  hashrateLuxos: number,
  poolCommissionStockOs: number,
  poolCommissionLuxos: number,
  monthlyElectricityHosting: number,
  machineCost: number,
  machineLifeYears: number = MACHINE_LIFE_YEARS,
  startDate: Date = new Date(),
): Strategy2Values => {
  const base = calculateAllValues(
    btcPrice,
    rewardBtcPerPhDay,
    hashrateStockOs,
    hashrateLuxos,
    poolCommissionStockOs,
    poolCommissionLuxos,
    monthlyElectricityHosting,
    machineCost,
  );

  const lifetimeMonths = machineLifeYears * 12;
  const lifetimeBtcStock = calculateLifetimeBtc(
    base.dailyBtcStock,
    startDate,
    machineLifeYears,
  );
  const lifetimeBtcLux = calculateLifetimeBtc(
    base.dailyBtcLux,
    startDate,
    machineLifeYears,
  );
  const lifetimeRevenueStock = lifetimeBtcStock * btcPrice;
  const lifetimeRevenueLux = lifetimeBtcLux * btcPrice;
  const lifetimeElectricityHostingCharges =
    monthlyElectricityHosting * lifetimeMonths;
  const machineDepreciation = machineCost;

  const netProfitLifetimeStock =
    lifetimeRevenueStock -
    machineDepreciation -
    lifetimeElectricityHostingCharges;
  const netProfitLifetimeLux =
    lifetimeRevenueLux -
    machineDepreciation -
    lifetimeElectricityHostingCharges;

  const totalLifetimeCost =
    machineDepreciation + lifetimeElectricityHostingCharges;
  const returnMultipleStock =
    totalLifetimeCost > 0 ? lifetimeRevenueStock / totalLifetimeCost : 0;
  const returnMultipleLux =
    totalLifetimeCost > 0 ? lifetimeRevenueLux / totalLifetimeCost : 0;

  // ROI is measured against average capital employed: the full machine cost
  // (paid upfront) plus half the lifetime hosting bill (paid gradually).
  const roiBasis = machineDepreciation + lifetimeElectricityHostingCharges / 2;
  const roiLifetimeStock =
    roiBasis > 0 ? (netProfitLifetimeStock / roiBasis) * 100 : 0;
  const roiLifetimeLux =
    roiBasis > 0 ? (netProfitLifetimeLux / roiBasis) * 100 : 0;

  const roiPerYearStock = roiLifetimeStock / machineLifeYears;
  const roiPerYearLux = roiLifetimeLux / machineLifeYears;

  return {
    ...base,
    lifetimeBtcStock,
    lifetimeBtcLux,
    lifetimeRevenueStock,
    lifetimeRevenueLux,
    lifetimeElectricityHostingCharges,
    machineDepreciation,
    netProfitLifetimeStock,
    netProfitLifetimeLux,
    returnMultipleStock,
    returnMultipleLux,
    roiLifetimeStock,
    roiLifetimeLux,
    roiPerYearStock,
    roiPerYearLux,
  };
};

/**
 * Strategy 3 is Strategy 2 with the bills funded by a collateralised loan
 * instead of an outside source, so it carries one extra cost the other
 * strategies do not: the interest accrued on that loan over the machine's life.
 *
 * The profit, return-multiple and ROI figures returned here are the Strategy 2
 * figures net of that interest. Every other field is inherited unchanged —
 * the machine mines exactly the same BTC either way; only the cost of funding
 * the bills differs.
 */
export const calculateStrategy3Values = (
  btcPrice: number,
  rewardBtcPerPhDay: number,
  hashrateStockOs: number,
  hashrateLuxos: number,
  poolCommissionStockOs: number,
  poolCommissionLuxos: number,
  monthlyElectricityHosting: number,
  machineCost: number,
  machineLifeYears: number = MACHINE_LIFE_YEARS,
  startDate: Date = new Date(),
  borrowingRateApr: number = BORROWING_RATE_APR,
): Strategy3Values => {
  const base = calculateStrategy2Values(
    btcPrice,
    rewardBtcPerPhDay,
    hashrateStockOs,
    hashrateLuxos,
    poolCommissionStockOs,
    poolCommissionLuxos,
    monthlyElectricityHosting,
    machineCost,
    machineLifeYears,
    startDate,
  );

  // The bills funded by the loan are exactly the lifetime hosting charges.
  const loanPrincipal = base.lifetimeElectricityHostingCharges;
  const loanInterest = calculateLoanInterest(
    monthlyElectricityHosting,
    borrowingRateApr,
    machineLifeYears,
  );
  const loanBalanceAtEnd = loanPrincipal + loanInterest;

  const netProfitLifetimeStock = base.netProfitLifetimeStock - loanInterest;
  const netProfitLifetimeLux = base.netProfitLifetimeLux - loanInterest;

  // Revenue has to clear the machine plus the whole loan balance, interest
  // included — that balance is what actually gets settled at the end.
  const totalLifetimeCost = base.machineDepreciation + loanBalanceAtEnd;
  const returnMultipleStock =
    totalLifetimeCost > 0 ? base.lifetimeRevenueStock / totalLifetimeCost : 0;
  const returnMultipleLux =
    totalLifetimeCost > 0 ? base.lifetimeRevenueLux / totalLifetimeCost : 0;

  // ROI keeps Strategy 2's basis (machine cost plus half the bills, as average
  // capital employed) so the two strategies stay directly comparable. Interest
  // is a cost, not capital employed, so it belongs in the numerator only.
  const roiBasis = base.machineDepreciation + loanPrincipal / 2;
  const roiLifetimeStock =
    roiBasis > 0 ? (netProfitLifetimeStock / roiBasis) * 100 : 0;
  const roiLifetimeLux =
    roiBasis > 0 ? (netProfitLifetimeLux / roiBasis) * 100 : 0;

  return {
    ...base,
    netProfitLifetimeStock,
    netProfitLifetimeLux,
    returnMultipleStock,
    returnMultipleLux,
    roiLifetimeStock,
    roiLifetimeLux,
    roiPerYearStock: roiLifetimeStock / machineLifeYears,
    roiPerYearLux: roiLifetimeLux / machineLifeYears,
    loanPrincipal,
    loanInterest,
    loanBalanceAtEnd,
    borrowingRateApr,
  };
};
