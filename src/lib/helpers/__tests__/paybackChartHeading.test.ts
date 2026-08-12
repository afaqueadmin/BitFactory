import { describe, it, expect } from "vitest";
import { buildPaybackChartHeading } from "@/lib/helpers/paybackChartHeading";

const BASE = "Buy BTC vs Mine BTC";

describe("buildPaybackChartHeading", () => {
  it("appends the OS label when a specific OS filter is active", () => {
    expect(buildPaybackChartHeading(BASE, "S21 Pro", "STOCK")).toBe(
      `${BASE} — S21 Pro · Stock OS`,
    );
    expect(buildPaybackChartHeading(BASE, "S21 XP", "CUSTOM")).toBe(
      `${BASE} — S21 XP · Custom OS`,
    );
  });

  it("updates independently as either filter changes", () => {
    const proCustom = buildPaybackChartHeading(BASE, "S21 Pro", "CUSTOM");
    const proStock = buildPaybackChartHeading(BASE, "S21 Pro", "STOCK");
    const xpStock = buildPaybackChartHeading(BASE, "S21 XP", "STOCK");

    expect(proCustom).not.toBe(proStock);
    expect(proStock).not.toBe(xpStock);
  });
});
