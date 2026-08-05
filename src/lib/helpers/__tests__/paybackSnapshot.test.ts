import { describe, it, expect } from "vitest";
import {
  computeProfileBreakevens,
  buildSnapshotValues,
  SnapshotProfileConfig,
} from "@/lib/helpers/paybackSnapshot";
import { calculateBreakevenBtcPrice } from "@/lib/helpers/paybackCalculations";

const CLIENT_CONFIG: SnapshotProfileConfig = {
  monthlyInvoicingAmount: 199.05,
  poolCommissionStockOs: 2.5,
  poolCommissionLuxos: 2.5,
  s21proHashrateStockOs: 236,
  s21proHashrateLuxos: 252,
  s21xpHashrateStockOs: 240,
  s21xpHashrateLuxos: 260,
  breakevenBtcPrice: 63500,
};

const COMPANY_CONFIG: SnapshotProfileConfig = {
  monthlyInvoicingAmount: 350,
  poolCommissionStockOs: 3,
  poolCommissionLuxos: 2,
  s21proHashrateStockOs: 236,
  s21proHashrateLuxos: 252,
  s21xpHashrateStockOs: 240,
  s21xpHashrateLuxos: 260,
  breakevenBtcPrice: 63500,
};

const REWARD_BTC_PER_PH_DAY = 0.00044827;

describe("computeProfileBreakevens", () => {
  it("matches calculateBreakevenBtcPrice for each miner/OS combination", () => {
    const result = computeProfileBreakevens(
      CLIENT_CONFIG,
      REWARD_BTC_PER_PH_DAY,
    );

    expect(result.s21proStock).toBeCloseTo(
      calculateBreakevenBtcPrice(
        CLIENT_CONFIG.monthlyInvoicingAmount,
        REWARD_BTC_PER_PH_DAY,
        CLIENT_CONFIG.s21proHashrateStockOs,
        CLIENT_CONFIG.poolCommissionStockOs,
        CLIENT_CONFIG.breakevenBtcPrice,
      ),
      10,
    );
    expect(result.s21proCustom).toBeCloseTo(
      calculateBreakevenBtcPrice(
        CLIENT_CONFIG.monthlyInvoicingAmount,
        REWARD_BTC_PER_PH_DAY,
        CLIENT_CONFIG.s21proHashrateLuxos,
        CLIENT_CONFIG.poolCommissionLuxos,
        CLIENT_CONFIG.breakevenBtcPrice,
      ),
      10,
    );
    expect(result.s21xpStock).toBeCloseTo(
      calculateBreakevenBtcPrice(
        CLIENT_CONFIG.monthlyInvoicingAmount,
        REWARD_BTC_PER_PH_DAY,
        CLIENT_CONFIG.s21xpHashrateStockOs,
        CLIENT_CONFIG.poolCommissionStockOs,
        CLIENT_CONFIG.breakevenBtcPrice,
      ),
      10,
    );
    expect(result.s21xpCustom).toBeCloseTo(
      calculateBreakevenBtcPrice(
        CLIENT_CONFIG.monthlyInvoicingAmount,
        REWARD_BTC_PER_PH_DAY,
        CLIENT_CONFIG.s21xpHashrateLuxos,
        CLIENT_CONFIG.poolCommissionLuxos,
        CLIENT_CONFIG.breakevenBtcPrice,
      ),
      10,
    );
  });

  it("falls back to the config's breakevenBtcPrice when the denominator is non-positive", () => {
    const zeroRewardResult = computeProfileBreakevens(CLIENT_CONFIG, 0);
    expect(zeroRewardResult.s21proStock).toBe(CLIENT_CONFIG.breakevenBtcPrice);
    expect(zeroRewardResult.s21xpCustom).toBe(CLIENT_CONFIG.breakevenBtcPrice);
  });
});

describe("buildSnapshotValues", () => {
  it("computes both CLIENT and COMPANY breakevens using their own profile configs", () => {
    const values = buildSnapshotValues({
      btcCloseUsd: 68000,
      hashpriceBtcPerPhDay: REWARD_BTC_PER_PH_DAY,
      clientConfig: CLIENT_CONFIG,
      companyConfig: COMPANY_CONFIG,
    });

    const expectedClient = computeProfileBreakevens(
      CLIENT_CONFIG,
      REWARD_BTC_PER_PH_DAY,
    );
    const expectedCompany = computeProfileBreakevens(
      COMPANY_CONFIG,
      REWARD_BTC_PER_PH_DAY,
    );

    expect(values.btcCloseUsd).toBe(68000);
    expect(values.hashpriceBtcPerPhDay).toBe(REWARD_BTC_PER_PH_DAY);
    expect(values.clientS21ProStockBreakeven).toBeCloseTo(
      expectedClient.s21proStock,
      10,
    );
    expect(values.clientS21XpCustomBreakeven).toBeCloseTo(
      expectedClient.s21xpCustom,
      10,
    );
    expect(values.companyS21ProStockBreakeven).toBeCloseTo(
      expectedCompany.s21proStock,
      10,
    );
    expect(values.companyS21XpCustomBreakeven).toBeCloseTo(
      expectedCompany.s21xpCustom,
      10,
    );

    // CLIENT and COMPANY configs differ (monthlyInvoicingAmount, pool
    // commissions), so their computed breakevens must not collapse to the
    // same numbers even though the same reward feeds both.
    expect(values.clientS21ProStockBreakeven).not.toBeCloseTo(
      values.companyS21ProStockBreakeven,
      2,
    );
  });
});
