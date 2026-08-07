import { describe, it, expect } from "vitest";
import {
  calculateLifetimeBtc,
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
