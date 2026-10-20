import { describe, expect, it } from "vitest";
import { simShareDays } from "../share";

const SUB = "sub-higgs";

describe("simShareDays", () => {
  it("credits the miner's share of the subaccount's real credit that day", () => {
    // 18 Oct 2026, from the higgs subaccount: the worker's estimate over the
    // subaccount's summed estimates, times what Luxor actually credited.
    const days = simShareDays({
      days: ["2026-10-18"],
      worker: [
        {
          subaccountId: SUB,
          date: "2026-10-18",
          estRevenue: 0.00012251,
          hashrate: 2.7e14,
        },
      ],
      totals: [
        { subaccountId: SUB, date: "2026-10-18", estRevenue: 0.00244585 },
      ],
      credits: [
        { subaccountId: SUB, date: "2026-10-18", miningRevenue: 0.00238403 },
      ],
    });
    expect(days).toEqual([
      {
        date: "2026-10-18",
        hashrate: 2.7e14,
        btc: parseFloat(((0.00012251 / 0.00244585) * 0.00238403).toFixed(8)),
      },
    ]);
    // Net of the pool fee: below the worker's own gross estimate.
    expect(days[0].btc).toBeLessThan(0.00012251);
  });

  it("borrows the latest share when a day's worker metrics are missing", () => {
    const days = simShareDays({
      days: ["2026-10-19"],
      worker: [
        { subaccountId: SUB, date: "2026-10-17", estRevenue: 1, hashrate: 5 },
        { subaccountId: SUB, date: "2026-10-18", estRevenue: 2, hashrate: 5 },
      ],
      totals: [
        { subaccountId: SUB, date: "2026-10-17", estRevenue: 10 },
        { subaccountId: SUB, date: "2026-10-18", estRevenue: 10 },
      ],
      credits: [{ subaccountId: SUB, date: "2026-10-19", miningRevenue: 0.5 }],
    });
    expect(days).toEqual([{ date: "2026-10-19", hashrate: 0, btc: 0.1 }]);
  });

  it("doesn't borrow a share older than the lookback window", () => {
    expect(
      simShareDays({
        days: ["2026-10-19"],
        worker: [
          { subaccountId: SUB, date: "2026-10-01", estRevenue: 1, hashrate: 5 },
        ],
        totals: [{ subaccountId: SUB, date: "2026-10-01", estRevenue: 10 }],
        credits: [
          { subaccountId: SUB, date: "2026-10-19", miningRevenue: 0.5 },
        ],
      }),
    ).toEqual([]);
  });

  it("leaves out a day the subaccount hasn't been credited for yet", () => {
    expect(
      simShareDays({
        days: ["2026-10-19"],
        worker: [
          { subaccountId: SUB, date: "2026-10-19", estRevenue: 1, hashrate: 5 },
        ],
        totals: [{ subaccountId: SUB, date: "2026-10-19", estRevenue: 10 }],
        credits: [],
      }),
    ).toEqual([]);
  });

  it("sums the shares of a miner that moved subaccounts mid-day", () => {
    const days = simShareDays({
      days: ["2026-10-18"],
      worker: [
        { subaccountId: "a", date: "2026-10-18", estRevenue: 1, hashrate: 3 },
        { subaccountId: "b", date: "2026-10-18", estRevenue: 1, hashrate: 2 },
      ],
      totals: [
        { subaccountId: "a", date: "2026-10-18", estRevenue: 4 },
        { subaccountId: "b", date: "2026-10-18", estRevenue: 2 },
      ],
      credits: [
        { subaccountId: "a", date: "2026-10-18", miningRevenue: 0.4 },
        { subaccountId: "b", date: "2026-10-18", miningRevenue: 0.2 },
      ],
    });
    expect(days).toEqual([{ date: "2026-10-18", hashrate: 5, btc: 0.2 }]);
  });
});
