import { describe, expect, it } from "vitest";
import {
  ledgerBalance,
  ledgerElectricityTotal,
  simChargeDay,
  type SimLedgerRow,
} from "../ledger";

const row = (
  type: SimLedgerRow["type"],
  amount: number,
  id = `${type}-${amount}`,
): SimLedgerRow => ({
  id,
  createdAt: new Date("2026-10-19T00:00:00.000Z"),
  amount,
  consumption: type === "ELECTRICITY_CHARGES" ? 87.48 : 0,
  type,
  narration: null,
});

describe("simChargeDay", () => {
  it("charges the day that just ended", () => {
    expect(
      simChargeDay(
        new Date("2026-10-19T07:56:12.000Z"),
        new Date("2026-10-20T00:05:00.000Z"),
      ),
    ).toBe("2026-10-19");
  });

  it("charges the registration day in full, like a real AUTO miner", () => {
    expect(
      simChargeDay(
        new Date("2026-10-19T23:59:00.000Z"),
        new Date("2026-10-20T00:05:00.000Z"),
      ),
    ).toBe("2026-10-19");
  });

  it("charges nothing for an account that started today", () => {
    expect(
      simChargeDay(
        new Date("2026-10-20T00:01:00.000Z"),
        new Date("2026-10-20T00:05:00.000Z"),
      ),
    ).toBeNull();
  });
});

describe("ledgerBalance", () => {
  it("adds the bonus, payments and adjustments and takes off charges", () => {
    expect(
      ledgerBalance([
        row("PAYMENT", 500),
        row("ELECTRICITY_CHARGES", -4.9),
        row("ADJUSTMENT", -10),
        row("PAYMENT", 100),
      ]),
    ).toBeCloseTo(585.1, 2);
  });

  it("can go negative", () => {
    expect(
      ledgerBalance([row("PAYMENT", 5), row("ELECTRICITY_CHARGES", -9.8)]),
    ).toBeCloseTo(-4.8, 2);
  });
});

describe("ledgerElectricityTotal", () => {
  it("totals only the electricity charges, as a positive amount", () => {
    expect(
      ledgerElectricityTotal([
        row("PAYMENT", 500),
        row("ELECTRICITY_CHARGES", -4.9, "a"),
        row("ELECTRICITY_CHARGES", -4.9, "b"),
        row("ADJUSTMENT", -10),
      ]),
    ).toBeCloseTo(9.8, 2);
  });
});
