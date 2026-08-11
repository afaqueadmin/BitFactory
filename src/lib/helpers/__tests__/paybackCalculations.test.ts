import { describe, it, expect } from "vitest";
import {
  BORROWING_RATE_APR,
  calculateLifetimeBtc,
  calculateLoanInterest,
  calculateStrategy2Values,
  calculateStrategy3Values,
  NEXT_HALVING_DATE,
} from "@/lib/helpers/paybackCalculations";

describe("calculateLifetimeBtc", () => {
  it("splits production across the halving: full rate before, half rate after", () => {
    const dailyBtc = 0.001;
    const startDate = new Date(Date.UTC(2026, 7, 6)); // 2026-08-06
    const lifespanEnd = new Date(startDate);
    lifespanEnd.setFullYear(lifespanEnd.getFullYear() + 5); // 2031-08-06

    const msPerDay = 1000 * 60 * 60 * 24;
    const daysBeforeHalving = Math.round(
      (NEXT_HALVING_DATE.getTime() - startDate.getTime()) / msPerDay,
    );
    const daysAfterHalving = Math.round(
      (lifespanEnd.getTime() - NEXT_HALVING_DATE.getTime()) / msPerDay,
    );

    const expected =
      dailyBtc * daysBeforeHalving + dailyBtc * 0.5 * daysAfterHalving;

    expect(calculateLifetimeBtc(dailyBtc, startDate)).toBeCloseTo(expected, 8);
  });

  it("applies the full (unhalved) rate for the entire life when halving is after the 5-year lifespan ends", () => {
    const dailyBtc = 0.001;
    const startDate = new Date(Date.UTC(2015, 0, 1));
    // Lifespan ends 2020-01-01, well before the 2028 halving.
    const totalDays = 5 * 365 + 1; // includes one leap day (2016 or 2020)

    const result = calculateLifetimeBtc(dailyBtc, startDate);
    expect(result).toBeCloseTo(dailyBtc * totalDays, 6);
  });

  it("applies the halved rate for the entire life when the halving already occurred before the start date", () => {
    const dailyBtc = 0.001;
    const startDate = new Date(Date.UTC(2030, 0, 1)); // after 2028-04-13 halving
    const lifespanEnd = new Date(startDate);
    lifespanEnd.setFullYear(lifespanEnd.getFullYear() + 5);
    const totalDays = Math.round(
      (lifespanEnd.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    const result = calculateLifetimeBtc(dailyBtc, startDate);
    expect(result).toBeCloseTo(dailyBtc * 0.5 * totalDays, 6);
  });

  it("returns 0 when dailyBtc is 0", () => {
    expect(calculateLifetimeBtc(0, new Date(Date.UTC(2026, 7, 6)))).toBe(0);
  });
});

describe("calculateLoanInterest", () => {
  it("accrues monthly on a balance that builds up one bill at a time", () => {
    const monthly = 199;
    const monthlyRate = BORROWING_RATE_APR / 100 / 12;

    let balance = 0;
    let expected = 0;
    for (let month = 0; month < 60; month++) {
      balance += monthly;
      const accrued = balance * monthlyRate;
      expected += accrued;
      balance += accrued;
    }

    expect(calculateLoanInterest(monthly)).toBeCloseTo(expected, 8);
  });

  it("exceeds simple interest on the average balance, because interest capitalises", () => {
    const monthly = 199;
    const principal = monthly * 60;
    // Simple interest on the average outstanding balance (half the principal).
    const simple = (principal / 2) * (BORROWING_RATE_APR / 100) * 5;

    expect(calculateLoanInterest(monthly)).toBeGreaterThan(simple);
  });

  it("is zero when nothing is borrowed or the rate is zero", () => {
    expect(calculateLoanInterest(0)).toBe(0);
    expect(calculateLoanInterest(199, 0)).toBe(0);
  });

  it("scales with the machine life it funds", () => {
    expect(calculateLoanInterest(199, 4, 5)).toBeGreaterThan(
      calculateLoanInterest(199, 4, 3),
    );
  });
});

describe("calculateStrategy3Values", () => {
  const args = [
    150_000, // btcPrice
    0.00044827, // rewardBtcPerPhDay
    236, // hashrateStockOs
    252, // hashrateLuxos
    2.5, // poolCommissionStockOs
    2.5, // poolCommissionLuxos
    199, // monthlyElectricityHosting
    4051, // machineCost
    5, // machineLifeYears
    new Date(Date.UTC(2026, 7, 6)), // fixed start so the halving split is stable
  ] as const;

  const strategy2 = calculateStrategy2Values(...args);
  const strategy3 = calculateStrategy3Values(...args);

  it("deducts exactly the accrued loan interest from lifetime profit", () => {
    const interest = calculateLoanInterest(199, BORROWING_RATE_APR, 5);

    expect(strategy3.loanInterest).toBeCloseTo(interest, 8);
    expect(strategy3.netProfitLifetimeStock).toBeCloseTo(
      strategy2.netProfitLifetimeStock - interest,
      8,
    );
    expect(strategy3.netProfitLifetimeLux).toBeCloseTo(
      strategy2.netProfitLifetimeLux - interest,
      8,
    );
  });

  it("reports a strictly worse return than Strategy 2 on the same machine", () => {
    expect(strategy3.netProfitLifetimeStock).toBeLessThan(
      strategy2.netProfitLifetimeStock,
    );
    expect(strategy3.returnMultipleStock).toBeLessThan(
      strategy2.returnMultipleStock,
    );
    expect(strategy3.roiLifetimeStock).toBeLessThan(strategy2.roiLifetimeStock);
    expect(strategy3.roiPerYearStock).toBeLessThan(strategy2.roiPerYearStock);
  });

  it("leaves mining output untouched — only the cost of funding differs", () => {
    expect(strategy3.lifetimeBtcStock).toBe(strategy2.lifetimeBtcStock);
    expect(strategy3.lifetimeRevenueStock).toBe(strategy2.lifetimeRevenueStock);
    expect(strategy3.dailyBtcStock).toBe(strategy2.dailyBtcStock);
    expect(strategy3.paybackMonthsStock).toBe(strategy2.paybackMonthsStock);
  });

  it("carries a loan balance of principal plus interest", () => {
    expect(strategy3.loanPrincipal).toBeCloseTo(199 * 60, 8);
    expect(strategy3.loanBalanceAtEnd).toBeCloseTo(
      strategy3.loanPrincipal + strategy3.loanInterest,
      8,
    );
  });

  it("keeps ROI/year consistent with lifetime ROI over the machine life", () => {
    expect(strategy3.roiPerYearStock).toBeCloseTo(
      strategy3.roiLifetimeStock / 5,
      8,
    );
  });
});
