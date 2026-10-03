import { describe, it, expect } from "vitest";
import {
  PAST_SHARE,
  buildForecastBaseline,
  buildForecastChartSeries,
  buildHalvingForecast,
} from "@/lib/helpers/btcPriceForecast";

const point = (date: string, price: number, stock: number, custom = stock) => ({
  date,
  btcPriceUsd: price,
  stockOsBreakeven: stock,
  customOsBreakeven: custom,
});

describe("buildForecastBaseline", () => {
  it("returns null with no usable history", () => {
    expect(buildForecastBaseline([], "STOCK")).toBeNull();
    expect(
      buildForecastBaseline([point("2026-09-01", 80000, 0)], "STOCK"),
    ).toBeNull();
  });

  it("uses the latest day and averages premiums per window", () => {
    const history = [
      point("2026-01-01", 60000, 40000, 30000), // 1.5x, outside 90D
      point("2026-09-01", 90000, 45000, 30000), // 2x
      point("2026-09-27", 80000, 40000, 32000), // 2x (latest)
    ];
    const stock = buildForecastBaseline(history, "STOCK")!;
    expect(stock.date).toBe("2026-09-27");
    expect(stock.productionCost).toBe(40000);
    expect(stock.premiums.CURRENT).toBe(2);
    expect(stock.premiums.AVG_30D).toBe(2);
    expect(stock.premiums.AVG_90D).toBe(2);
    expect(stock.premiums.AVG_ALL).toBeCloseTo(5.5 / 3);
    expect(stock.firstDate).toBe("2026-01-01");
    expect(stock.historyDays).toBe(270);
    expect(stock.premiumLow).toBe(1.5);
    expect(stock.premiumHigh).toBe(2);

    expect(stock.firstTimestamp).toBe(Date.UTC(2026, 0, 1));

    const custom = buildForecastBaseline(history, "CUSTOM")!;
    expect(custom.productionCost).toBe(32000);
    expect(custom.premiums.CURRENT).toBe(2.5);
  });
  it("accepts full ISO timestamps and skips unparseable dates", () => {
    const baseline = buildForecastBaseline(
      [
        point("garbage", 70000, 35000),
        point("2026-09-01T00:00:00.000Z", 90000, 45000),
        point("2026-09-27T00:00:00.000Z", 80000, 40000),
      ],
      "STOCK",
    )!;
    expect(Number.isFinite(baseline.firstTimestamp)).toBe(true);
    expect(baseline.historyDays).toBe(27);
    const rows = buildHalvingForecast(baseline, 2);
    expect(rows.every((r) => Number.isFinite(r.timestamp))).toBe(true);
  });
});

describe("buildHalvingForecast", () => {
  it("doubles cost each halving and applies the premium", () => {
    const rows = buildHalvingForecast(
      {
        date: "2026-09-27",
        btcPriceUsd: 80000,
        productionCost: 40000,
        premiumLow: 0.8,
        premiumHigh: 2.2,
      },
      1.8,
    );
    expect(rows.map((r) => r.label)).toEqual([
      "Today",
      "2028",
      "2032",
      "2036",
      "2040",
      "2044",
    ]);
    expect(rows[0].predictedPrice).toBe(80000);
    expect(rows[1].productionCost).toBe(80000);
    expect(rows[1].predictedPrice).toBe(144000);
    expect(rows[1].blockReward).toBe(1.5625);
    expect(rows[5].productionCost).toBe(40000 * 32);
    expect(rows[5].multipleOfToday).toBeCloseTo((40000 * 32 * 1.8) / 80000);
    expect(rows[0].annualGrowth).toBeNull();
    // 2026-09-27 -> 2028-04-13 is ~1.54 years for a 1.8x move.
    expect(rows[1].annualGrowth!).toBeCloseTo(1.8 ** (1 / 1.5414) - 1, 2);
  });

  it("bands price by the observed premium range, never below cost", () => {
    const rows = buildHalvingForecast(
      {
        date: "2026-09-27",
        btcPriceUsd: 80000,
        productionCost: 40000,
        premiumLow: 0.8,
        premiumHigh: 2.2,
      },
      1.8,
    );
    expect(rows[1].priceLow).toBe(rows[1].productionCost); // floored at 1x
    expect(rows[1].priceHigh).toBeCloseTo(80000 * 2.2);
    expect(rows[0].priceLow).toBe(80000);
  });
});

describe("buildForecastChartSeries", () => {
  const history = [
    point("2026-08-01", 60000, 40000, 30000),
    point("2026-08-31", 70000, 42000, 31000),
    point("2026-09-30", 80000, 40000, 32000),
  ];
  const baseline = buildForecastBaseline(history, "STOCK")!;
  const rows = buildHalvingForecast(baseline, 1.8);

  it("puts the past in the first PAST_SHARE of the chart, forecast after", () => {
    const { points, todayX, xOf } = buildForecastChartSeries(
      history,
      "STOCK",
      rows,
    );
    expect(points[0].x).toBe(0);
    expect(todayX).toBe(PAST_SHARE);
    expect(points[points.length - 1].x).toBe(1);
    expect(xOf(Date.UTC(2026, 7, 31))).toBeCloseTo(PAST_SHARE / 2, 5);
    // Strictly increasing positions.
    for (let i = 1; i < points.length; i++) {
      expect(points[i].x).toBeGreaterThan(points[i - 1].x);
    }
  });

  it("joins past and forecast lines at today", () => {
    const { points } = buildForecastChartSeries(history, "STOCK", rows);
    const past = points.filter((p) => p.row === null);
    expect(past).toHaveLength(2); // today comes from rows[0]
    expect(past.every((p) => p.forecastPrice === null)).toBe(true);
    const today = points.find((p) => p.row?.halvings === 0)!;
    expect(today.pastPrice).toBe(80000);
    expect(today.forecastPrice).toBe(80000);
    expect(today.forecastLabel).toBeNull();
    const halving = points.find((p) => p.row?.halvings === 1)!;
    expect(halving.pastPrice).toBeNull();
    expect(halving.forecastLabel).toBe(halving.forecastPrice);
  });

  it("uses the selected OS for past cost", () => {
    const custom = buildForecastChartSeries(
      history,
      "CUSTOM",
      buildHalvingForecast(buildForecastBaseline(history, "CUSTOM")!, 1.8),
    );
    expect(custom.points[0].cost).toBe(30000);
  });
});
