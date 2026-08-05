import { calculateBreakevenBtcPrice } from "@/lib/helpers/paybackCalculations";

export interface SnapshotProfileConfig {
  monthlyInvoicingAmount: number;
  poolCommissionStockOs: number;
  poolCommissionLuxos: number;
  s21proHashrateStockOs: number;
  s21proHashrateLuxos: number;
  s21xpHashrateStockOs: number;
  s21xpHashrateLuxos: number;
  breakevenBtcPrice: number;
}

export interface ProfileBreakevens {
  s21proStock: number;
  s21proCustom: number;
  s21xpStock: number;
  s21xpCustom: number;
}

/**
 * Computes Stock/Custom OS breakeven BTC prices for both miner models for a
 * single profile (CLIENT or COMPANY), reusing the same calculateBreakevenBtcPrice
 * formula and config fields the live payback-analysis pages use per-render.
 */
export const computeProfileBreakevens = (
  config: SnapshotProfileConfig,
  rewardBtcPerPhDay: number,
): ProfileBreakevens => ({
  s21proStock: calculateBreakevenBtcPrice(
    config.monthlyInvoicingAmount,
    rewardBtcPerPhDay,
    config.s21proHashrateStockOs,
    config.poolCommissionStockOs,
    config.breakevenBtcPrice,
  ),
  s21proCustom: calculateBreakevenBtcPrice(
    config.monthlyInvoicingAmount,
    rewardBtcPerPhDay,
    config.s21proHashrateLuxos,
    config.poolCommissionLuxos,
    config.breakevenBtcPrice,
  ),
  s21xpStock: calculateBreakevenBtcPrice(
    config.monthlyInvoicingAmount,
    rewardBtcPerPhDay,
    config.s21xpHashrateStockOs,
    config.poolCommissionStockOs,
    config.breakevenBtcPrice,
  ),
  s21xpCustom: calculateBreakevenBtcPrice(
    config.monthlyInvoicingAmount,
    rewardBtcPerPhDay,
    config.s21xpHashrateLuxos,
    config.poolCommissionLuxos,
    config.breakevenBtcPrice,
  ),
});

export interface SnapshotComputationInput {
  btcCloseUsd: number;
  hashpriceBtcPerPhDay: number;
  clientConfig: SnapshotProfileConfig;
  companyConfig: SnapshotProfileConfig;
}

export interface SnapshotValues {
  btcCloseUsd: number;
  hashpriceBtcPerPhDay: number;
  clientS21ProStockBreakeven: number;
  clientS21ProCustomBreakeven: number;
  clientS21XpStockBreakeven: number;
  clientS21XpCustomBreakeven: number;
  companyS21ProStockBreakeven: number;
  companyS21ProCustomBreakeven: number;
  companyS21XpStockBreakeven: number;
  companyS21XpCustomBreakeven: number;
}

/**
 * Builds the full PaybackDailySnapshot row payload (minus date/id/timestamps)
 * from already-fetched inputs. Pure and unit-testable in isolation from the
 * Binance/Luxor/Prisma I/O that gathers those inputs.
 */
export const buildSnapshotValues = (
  input: SnapshotComputationInput,
): SnapshotValues => {
  const client = computeProfileBreakevens(
    input.clientConfig,
    input.hashpriceBtcPerPhDay,
  );
  const company = computeProfileBreakevens(
    input.companyConfig,
    input.hashpriceBtcPerPhDay,
  );

  return {
    btcCloseUsd: input.btcCloseUsd,
    hashpriceBtcPerPhDay: input.hashpriceBtcPerPhDay,
    clientS21ProStockBreakeven: client.s21proStock,
    clientS21ProCustomBreakeven: client.s21proCustom,
    clientS21XpStockBreakeven: client.s21xpStock,
    clientS21XpCustomBreakeven: client.s21xpCustom,
    companyS21ProStockBreakeven: company.s21proStock,
    companyS21ProCustomBreakeven: company.s21proCustom,
    companyS21XpStockBreakeven: company.s21xpStock,
    companyS21XpCustomBreakeven: company.s21xpCustom,
  };
};
