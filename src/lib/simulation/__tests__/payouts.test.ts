import { describe, expect, it } from "vitest";
import { simPoolLedger, type SimDay } from "@/lib/simulation/payouts";

const day = (date: string, btc: number): SimDay => ({
  date,
  hashrate: 1e14,
  btc,
});

const priceByDay = new Map([
  ["2026-09-29", 100_000],
  ["2026-09-30", 100_000],
  ["2026-10-01", 110_000],
  ["2026-10-02", 110_000],
  ["2026-11-01", 120_000],
]);

describe("simPoolLedger", () => {
  it("credits each earning day as Miner Revenue, masked", () => {
    const ledger = simPoolLedger({
      days: [day("2026-09-29", 0.0001), day("2026-09-30", 0.0002)],
      now: new Date("2026-09-30T12:00:00Z"),
      feeBtc: 0.00001,
      priceByDay,
    });
    expect(ledger.transactions).toHaveLength(2);
    expect(ledger.transactions[0]).toEqual({
      pool: "Luxor",
      currency_type: "BTC",
      date_time: "2026-09-30T00:00:00.000Z",
      address_name: "",
      subaccount_name: "Simulation",
      transaction_category: "Miner Revenue",
      currency_amount: 0.0002,
      usd_equivalent: 20,
      transaction_id: "",
      transaction_type: "credit",
    });
    expect(ledger.totalEarnedBtc).toBe(0.0003);
    expect(ledger.pendingBtc).toBe(0.0003);
    expect(ledger.lastPayoutAt).toBeNull();
  });

  it("pays out on the 1st: a payment and a fee, then pending restarts", () => {
    const ledger = simPoolLedger({
      days: [
        day("2026-09-29", 0.0001),
        day("2026-09-30", 0.0002),
        day("2026-10-01", 0.0004),
      ],
      now: new Date("2026-10-02T08:00:00Z"),
      feeBtc: 0.00001,
      priceByDay,
    });
    const payout = ledger.transactions.filter(
      (t) => t.transaction_type === "debit",
    );
    expect(
      payout.map((t) => [t.transaction_category, t.currency_amount]),
    ).toEqual([
      ["Payment", 0.00029],
      ["Transaction Fee", 0.00001],
    ]);
    expect(
      payout.every((t) => t.date_time === "2026-10-01T00:00:00.000Z"),
    ).toBe(true);
    expect(
      payout.every((t) => t.address_name === "" && t.transaction_id === ""),
    ).toBe(true);
    expect(ledger.pendingBtc).toBe(0.0004);
    expect(ledger.totalEarnedBtc).toBe(0.0007);
    expect(ledger.lastPayoutAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("pays out a month with no later earnings once the 1st has passed", () => {
    const ledger = simPoolLedger({
      days: [day("2026-10-02", 0.0005)],
      now: new Date("2026-11-01T00:00:01Z"),
      feeBtc: 0,
      priceByDay,
    });
    expect(ledger.pendingBtc).toBe(0);
    const payments = ledger.transactions.filter(
      (t) => t.transaction_category === "Payment",
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].usd_equivalent).toBe(60);
    // A zero fee adds no fee row.
    expect(
      ledger.transactions.some(
        (t) => t.transaction_category === "Transaction Fee",
      ),
    ).toBe(false);
  });

  it("carries a month that earned no more than the fee to the next payout", () => {
    const ledger = simPoolLedger({
      days: [day("2026-09-30", 0.000005)],
      now: new Date("2026-10-15T00:00:00Z"),
      feeBtc: 0.00001,
      priceByDay,
    });
    expect(
      ledger.transactions.some((t) => t.transaction_type === "debit"),
    ).toBe(false);
    expect(ledger.pendingBtc).toBe(0.000005);
  });

  it("lists newest first and ignores days that earned nothing", () => {
    const ledger = simPoolLedger({
      days: [day("2026-09-29", 0.0001), day("2026-09-30", 0)],
      now: new Date("2026-09-30T12:00:00Z"),
      feeBtc: 0,
      priceByDay,
    });
    expect(ledger.transactions.map((t) => t.date_time)).toEqual([
      "2026-09-29T00:00:00.000Z",
    ]);
  });

  it("is empty before anything is earned", () => {
    const ledger = simPoolLedger({
      days: [],
      now: new Date("2026-10-02T00:00:00Z"),
      feeBtc: 0.00001,
      priceByDay,
    });
    expect(ledger).toEqual({
      transactions: [],
      totalEarnedBtc: 0,
      pendingBtc: 0,
      lastPayoutAt: null,
    });
  });
});
