import { describe, it, expect } from "vitest";
import { buildPaybackBaseCase } from "@/lib/helpers/paybackBaseCase";

const point = (date: string, price: number, stock: number, custom = stock) => ({
  date,
  btcPriceUsd: price,
  stockOsBreakeven: stock,
  customOsBreakeven: custom,
});

const PRICES = [100000, 125000, 150000, 200000];

describe("buildPaybackBaseCase", () => {
  it("returns null without usable history or cost", () => {
    expect(buildPaybackBaseCase(55000, [], "STOCK", PRICES)).toBeNull();
    expect(
      buildPaybackBaseCase(0, [point("2026-10-01", 70000, 50000)], "STOCK"),
    ).toBeNull();
  });

  it("doubles today's cost, adds the average advantage and snaps to the nearest column", () => {
    const history = [
      point("2026-10-01", 65000, 50000), // +30%
      point("2026-10-02", 67500, 50000), // +35%
    ];
    const baseCase = buildPaybackBaseCase(55000, history, "STOCK", PRICES)!;

    expect(baseCase.averageAdvantage).toBeCloseTo(0.325);
    expect(baseCase.postHalvingCost).toBe(110000);
    expect(baseCase.basePrice).toBeCloseTo(145750);
    expect(baseCase.scenarioIndex).toBe(2);
    expect(baseCase.scenarioPrice).toBe(150000);
    expect(baseCase.historyDays).toBe(2);
  });

  it("quadruples the cost for the 2032 halving", () => {
    const history = [
      point("2026-10-01", 65000, 50000), // +30%
      point("2026-10-02", 67500, 50000), // +35%
    ];
    const baseCase = buildPaybackBaseCase(
      55000,
      history,
      "STOCK",
      [250000, 300000, 350000],
      4,
    )!;

    expect(baseCase.postHalvingCost).toBe(220000);
    expect(baseCase.basePrice).toBeCloseTo(291500);
    expect(baseCase.scenarioPrice).toBe(300000);
  });

  it("uses the selected OS's breakeven", () => {
    const history = [point("2026-10-01", 60000, 50000, 40000)]; // custom +50%
    const baseCase = buildPaybackBaseCase(40000, history, "CUSTOM", PRICES)!;

    expect(baseCase.averageAdvantage).toBeCloseTo(0.5);
    expect(baseCase.basePrice).toBeCloseTo(120000);
    expect(baseCase.scenarioPrice).toBe(125000);
  });

  it("averages only the last 365 days", () => {
    const history = [
      point("2025-01-01", 200000, 50000), // 4x, older than a year
      point("2026-10-01", 60000, 50000), // +20%
    ];
    const baseCase = buildPaybackBaseCase(50000, history, "STOCK", PRICES)!;

    expect(baseCase.averageAdvantage).toBeCloseTo(0.2);
    expect(baseCase.historyDays).toBe(1);
  });
});
