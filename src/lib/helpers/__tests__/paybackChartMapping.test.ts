import { describe, it, expect } from "vitest";
import {
  mapSnapshotsToChartSeries,
  PaybackHistoryPoint,
} from "@/lib/helpers/paybackChartMapping";

describe("mapSnapshotsToChartSeries", () => {
  it("maps API rows to chart series points with a human-readable date label", () => {
    const input: PaybackHistoryPoint[] = [
      {
        date: "2026-07-01",
        btcPriceUsd: 68000,
        stockOsBreakeven: 61000.5,
        customOsBreakeven: 59000.25,
      },
    ];

    const result = mapSnapshotsToChartSeries(input);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: "2026-07-01",
      btcPriceUsd: 68000,
      stockOsBreakeven: 61000.5,
      customOsBreakeven: 59000.25,
    });
    expect(result[0].dateLabel).toBe("Jul 1");
  });

  it("preserves input order (already sorted ascending by the API)", () => {
    const input: PaybackHistoryPoint[] = [
      {
        date: "2026-07-01",
        btcPriceUsd: 1,
        stockOsBreakeven: 1,
        customOsBreakeven: 1,
      },
      {
        date: "2026-07-02",
        btcPriceUsd: 2,
        stockOsBreakeven: 2,
        customOsBreakeven: 2,
      },
    ];

    const result = mapSnapshotsToChartSeries(input);
    expect(result.map((p) => p.date)).toEqual(["2026-07-01", "2026-07-02"]);
  });

  it("drops rows with non-finite or missing numeric values", () => {
    const input = [
      {
        date: "2026-07-01",
        btcPriceUsd: 68000,
        stockOsBreakeven: 61000,
        customOsBreakeven: 59000,
      },
      {
        date: "2026-07-02",
        btcPriceUsd: NaN,
        stockOsBreakeven: 61000,
        customOsBreakeven: 59000,
      },
      {
        date: "2026-07-03",
        btcPriceUsd: 68000,
        stockOsBreakeven: undefined,
        customOsBreakeven: 59000,
      },
    ] as unknown as PaybackHistoryPoint[];

    const result = mapSnapshotsToChartSeries(input);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-07-01");
  });

  it("returns an empty array for empty/undefined input", () => {
    expect(mapSnapshotsToChartSeries([])).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(mapSnapshotsToChartSeries(undefined as any)).toEqual([]);
  });
});
