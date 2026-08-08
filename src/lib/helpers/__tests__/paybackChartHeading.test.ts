import { describe, it, expect } from "vitest";
import { buildPaybackChartHeading } from "@/lib/helpers/paybackChartHeading";

const BASE = "Buy BTC vs Mine BTC";

describe("buildPaybackChartHeading", () => {
  it("shows only the miner when OS is COMPARISON (both lines shown, no OS filter applied)", () => {
    expect(buildPaybackChartHeading(BASE, "S21 Pro", "COMPARISON")).toBe(
      `${BASE} — S21 Pro`,
    );
    expect(buildPaybackChartHeading(BASE, "S21 XP", "COMPARISON")).toBe(
      `${BASE} — S21 XP`,
    );
  });

  it("appends the OS label when a specific OS filter is active", () => {
    expect(buildPaybackChartHeading(BASE, "S21 Pro", "STOCK")).toBe(
      `${BASE} — S21 Pro · Stock OS`,
    );
    expect(buildPaybackChartHeading(BASE, "S21 XP", "CUSTOM")).toBe(
      `${BASE} — S21 XP · Custom OS`,
    );
  });

  it("updates independently as either filter changes", () => {
    const proComparison = buildPaybackChartHeading(
      BASE,
      "S21 Pro",
      "COMPARISON",
    );
    const proStock = buildPaybackChartHeading(BASE, "S21 Pro", "STOCK");
    const xpStock = buildPaybackChartHeading(BASE, "S21 XP", "STOCK");

    expect(proComparison).not.toBe(proStock);
    expect(proStock).not.toBe(xpStock);
  });
});
