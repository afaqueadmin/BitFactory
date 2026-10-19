import { describe, expect, it } from "vitest";
import { ledgerBalance, rateAt, simCostLedger } from "@/lib/simulation/ledger";

const at = (iso: string) => new Date(iso);

describe("rateAt", () => {
  const rates = [
    { effectiveFrom: at("2026-01-01T00:00:00Z"), ratePerKwh: 0.05 },
    { effectiveFrom: at("2026-10-10T12:00:00Z"), ratePerKwh: 0.06 },
  ];

  it("uses the latest rate set on or before the moment", () => {
    expect(rateAt(rates, at("2026-10-10T00:00:00Z"))).toBe(0.05);
    expect(rateAt(rates, at("2026-10-11T00:00:00Z"))).toBe(0.06);
  });

  it("is 0 before any rate exists", () => {
    expect(rateAt(rates, at("2025-12-31T00:00:00Z"))).toBe(0);
  });
});

describe("simCostLedger", () => {
  const base = {
    since: at("2026-10-10T09:30:00Z"),
    now: at("2026-10-14T08:00:00Z"),
    bonusUsd: 100,
    powerUsageKw: 3.5,
    rates: [{ effectiveFrom: at("2026-01-01T00:00:00Z"), ratePerKwh: 0.06 }],
  };
  // 3.5 kW x 0.06 x 24 = 5.04 USD a day
  const allDays = new Map([
    ["2026-10-10", 1e14],
    ["2026-10-11", 1e14],
    ["2026-10-12", 1e14],
    ["2026-10-13", 1e14],
  ]);

  it("starts with the welcome bonus at registration", () => {
    const rows = simCostLedger({ ...base, hashrateByDay: new Map() });
    expect(rows).toEqual([
      {
        id: "sim-bonus",
        createdAt: base.since,
        amount: 100,
        consumption: 0,
        type: "PAYMENT",
        narration: "Welcome bonus",
      },
    ]);
  });

  it("charges each completed day from registration, posted the next midnight", () => {
    const rows = simCostLedger({ ...base, hashrateByDay: allDays });
    const charges = rows.filter((r) => r.type === "ELECTRICITY_CHARGES");
    expect(charges.map((c) => c.createdAt.toISOString())).toEqual([
      "2026-10-11T00:00:00.000Z",
      "2026-10-12T00:00:00.000Z",
      "2026-10-13T00:00:00.000Z",
      "2026-10-14T00:00:00.000Z",
    ]);
    expect(charges.every((c) => c.amount === -5.04)).toBe(true);
    expect(charges.every((c) => c.consumption === 84)).toBe(true);
    expect(ledgerBalance(rows)).toBeCloseTo(100 - 4 * 5.04, 2);
  });

  it("never charges today, which hasn't finished", () => {
    const rows = simCostLedger({
      ...base,
      hashrateByDay: new Map([...allDays, ["2026-10-14", 1e14]]),
    });
    expect(rows.some((r) => r.id === "sim-charge-2026-10-14")).toBe(false);
  });

  it("skips days the simulated worker didn't hash", () => {
    const rows = simCostLedger({
      ...base,
      hashrateByDay: new Map([
        ["2026-10-10", 1e14],
        ["2026-10-11", 0],
        ["2026-10-13", 1e14],
      ]),
    });
    expect(rows.map((r) => r.id)).toEqual([
      "sim-bonus",
      "sim-charge-2026-10-10",
      "sim-charge-2026-10-13",
    ]);
  });

  it("applies a rate change from the charge after it was set", () => {
    const rows = simCostLedger({
      ...base,
      rates: [
        ...base.rates,
        { effectiveFrom: at("2026-10-12T10:00:00Z"), ratePerKwh: 0.08 },
      ],
      hashrateByDay: allDays,
    });
    const amounts = rows
      .filter((r) => r.type === "ELECTRICITY_CHARGES")
      .map((r) => r.amount);
    // Posted 10-11, 10-12 at 0.06; 10-13, 10-14 at 0.08 (3.5 x 0.08 x 24).
    expect(amounts).toEqual([-5.04, -5.04, -6.72, -6.72]);
  });

  it("lets the balance go negative", () => {
    const rows = simCostLedger({
      ...base,
      bonusUsd: 10,
      hashrateByDay: allDays,
    });
    expect(ledgerBalance(rows)).toBeLessThan(0);
  });

  it("charges nothing when no rate is set, like the cron", () => {
    const rows = simCostLedger({ ...base, rates: [], hashrateByDay: allDays });
    expect(rows.map((r) => r.id)).toEqual(["sim-bonus"]);
  });

  it("has only the bonus on the registration day", () => {
    const rows = simCostLedger({
      ...base,
      now: at("2026-10-10T23:59:00Z"),
      hashrateByDay: allDays,
    });
    expect(rows.map((r) => r.id)).toEqual(["sim-bonus"]);
  });
});
