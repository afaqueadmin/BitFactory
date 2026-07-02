export type MinerModel = "S21PRO" | "S21XP";

export const MINER_LABELS: Record<MinerModel, string> = {
  S21PRO: "S21 Pro",
  S21XP: "S21 XP",
};

// Fallback constants (only used if live price/reward APIs fail)
export const FALLBACK_BTC_PRICE = 67953.35; // USD
export const FALLBACK_REWARD_BTC_PER_PH_DAY = 0.00044827;

// Scenario BTC prices (first 4 are fixed, last one comes from DB)
export const FIXED_SCENARIO_PRICES = [100000, 125000, 150000, 200000, 250000];

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
