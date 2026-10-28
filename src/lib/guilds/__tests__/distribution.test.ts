import { describe, expect, it } from "vitest";
import {
  calculateDistribution,
  isFullSplit,
  type DistributionInput,
  type DistributionMember,
} from "@/lib/guilds/distribution";

const NOW = new Date("2026-11-03T06:00:00Z");
const LONG_AGO = new Date("2026-10-01T00:00:00Z");

const member = (
  id: string,
  percent: number,
  extra: Partial<DistributionMember> = {},
): DistributionMember => ({
  membershipId: id,
  userId: `u-${id}`,
  name: id,
  isGuildmaster: false,
  percent,
  active: true,
  walletAddress: `bc1-${id}`,
  walletUpdatedAt: LONG_AGO,
  carriedInBtc: 0,
  ...extra,
});

const guild = () => [
  member("master", 40, { isGuildmaster: true }),
  member("a", 30),
  member("b", 30),
];

const invoice = (id: string, outstandingUsd: number) => ({
  invoiceId: id,
  invoiceNumber: `INV-${id}`,
  outstandingUsd,
});

const run = (overrides: Partial<DistributionInput>) =>
  calculateDistribution({
    payoutBtc: 0.01,
    btcUsdRate: 100_000,
    unpaidInvoices: [],
    members: guild(),
    splitUpdatedAt: null,
    now: NOW,
    minPayoutSats: 10_000,
    feePayer: "HIGGS",
    ...overrides,
  });

const sats = (btc: number) => Math.round(btc * 1e8);

describe("calculateDistribution", () => {
  it("takes the hosting first and splits the rest (the spec's example)", () => {
    const result = run({
      payoutBtc: 0.0035,
      btcUsdRate: 80566.83,
      unpaidInvoices: [invoice("nov", 199)],
    });

    expect(result.companyBtc).toBe(0.00247);
    expect(result.companyOutputBtc).toBe(0.00247);
    expect(result.companyUsd).toBe(199);
    expect(result.netBtc).toBe(0.00103);
    expect(result.shortfallUsd).toBe(0);
    expect(result.allocations).toEqual([
      { invoiceId: "nov", invoiceNumber: "INV-nov", amountUsd: 199 },
    ]);
    // 103,000 sats: 40% = 41,200, 30% = 30,900 each - all above 10,000.
    expect(result.shares.map((s) => sats(s.btcAmount))).toEqual([
      41_200, 30_900, 30_900,
    ]);
    expect(result.shares.map((s) => sats(s.paidBtc))).toEqual([
      41_200, 30_900, 30_900,
    ]);
    expect(result.carriedOutBtc).toBe(0);
    expect(result.holdReasons).toEqual([]);
  });

  it("gives everything to hosting when the payout falls short", () => {
    const result = run({
      payoutBtc: 0.002,
      btcUsdRate: 80566.83,
      unpaidInvoices: [invoice("nov", 199)],
    });

    expect(result.companyBtc).toBe(0.002);
    // 0.002 BTC × 80,566.83 = 161.13 USD (rounded down to the cent).
    expect(result.companyUsd).toBe(161.13);
    expect(result.shortfallUsd).toBe(37.87);
    expect(result.netBtc).toBe(0);
    expect(result.paidBtc).toBe(0);
  });

  it("pays a carried hosting shortfall before the new month, oldest first", () => {
    const result = run({
      unpaidInvoices: [invoice("oct", 37.87), invoice("nov", 199)],
    });

    expect(result.companyUsd).toBe(236.87);
    expect(result.allocations.map((a) => [a.invoiceId, a.amountUsd])).toEqual([
      ["oct", 37.87],
      ["nov", 199],
    ]);
    expect(sats(result.companyBtc)).toBe(236_870);
    expect(sats(result.netBtc)).toBe(763_130);
  });

  it("gives the leftover satoshi to the Guildmaster", () => {
    const result = run({
      payoutBtc: 0.001,
      members: [
        member("master", 33.3333, { isGuildmaster: true }),
        member("a", 33.3333),
        member("b", 33.3334),
      ],
    });
    const shares = result.shares.map((s) => sats(s.btcAmount));
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100_000);
    expect(shares[0]).toBe(33_334);
  });

  describe("carried shares", () => {
    it("carries a share below the minimum payout", () => {
      // 0.0002 BTC: master 8,000, a/b 6,000 sats - all under 10,000.
      const result = run({ payoutBtc: 0.0002 });
      expect(result.paidBtc).toBe(0);
      expect(result.shares.map((s) => sats(s.carriedOutBtc))).toEqual([
        8_000, 6_000, 6_000,
      ]);
      expect(result.shares[1].carryReason).toBe("Below the minimum payout");
      // Carrying doesn't hold the distribution - hosting still gets paid.
      expect(result.holdReasons).toEqual([]);
    });

    it("pays share plus carried once it reaches the minimum", () => {
      const result = run({
        payoutBtc: 0.0002,
        members: [
          member("master", 40, { isGuildmaster: true, carriedInBtc: 0.00008 }),
          member("a", 30, { carriedInBtc: 0.00006 }),
          member("b", 30),
        ],
      });
      // master 8,000 + 8,000 = 16,000 and a 6,000 + 6,000 = 12,000 are paid;
      // b's 6,000 is carried.
      expect(result.shares.map((s) => sats(s.paidBtc))).toEqual([
        16_000, 12_000, 0,
      ]);
      expect(result.shares.map((s) => sats(s.carriedOutBtc))).toEqual([
        0, 0, 6_000,
      ]);
    });

    it("carries instead of holding when a wallet is missing or frozen", () => {
      const result = run({
        members: [
          member("master", 50, { isGuildmaster: true }),
          member("a", 25, { walletAddress: null }),
          member("b", 25, {
            walletUpdatedAt: new Date("2026-11-02T12:00:00Z"),
          }),
        ],
      });
      expect(result.holdReasons).toEqual([]);
      expect(sats(result.shares[0].paidBtc)).toBe(500_000);
      expect(result.shares[1]).toMatchObject({
        paidBtc: 0,
        carriedOutBtc: 0.0025,
        carryReason: "No reward wallet yet",
      });
      expect(result.shares[2].carryReason).toBe(
        "Wallet changed less than 24 hours ago",
      );
    });

    it("pays a former member's carried balance whatever its size", () => {
      const result = run({
        members: [
          ...guild(),
          member("gone", 0, { active: false, carriedInBtc: 0.00002 }),
        ],
      });
      const gone = result.shares[3];
      expect(gone.btcAmount).toBe(0);
      expect(sats(gone.paidBtc)).toBe(2_000);
      // The split among active members is unaffected.
      expect(result.shares.slice(0, 3).map((s) => s.percent)).toEqual([
        40, 30, 30,
      ]);
    });

    it("keeps carried balances as they were while held", () => {
      const result = run({
        members: [
          member("master", 60, { isGuildmaster: true, carriedInBtc: 0.00005 }),
          member("a", 30),
        ],
      });
      expect(result.holdReasons).toContain(
        "Reward percentages don't add up to 100%",
      );
      expect(result.shares[0]).toMatchObject({
        btcAmount: 0,
        paidBtc: 0,
        carriedOutBtc: 0.00005,
      });
    });
  });

  describe("network fee", () => {
    const withFee = (feePayer: DistributionInput["feePayer"]) =>
      run({
        unpaidInvoices: [invoice("nov", 200)],
        networkFeeBtc: 0.00001,
        feePayer,
      });

    it("HIGGS: comes off the company output, invoices credited in full", () => {
      const r = withFee("HIGGS");
      expect(sats(r.companyBtc)).toBe(200_000);
      expect(sats(r.companyOutputBtc)).toBe(199_000);
      expect(r.companyUsd).toBe(200);
      expect(sats(r.netBtc)).toBe(800_000);
    });

    it("HOSTING_SHARE: comes off the company output and the credit", () => {
      const r = withFee("HOSTING_SHARE");
      expect(sats(r.companyOutputBtc)).toBe(199_000);
      expect(r.companyUsd).toBe(199);
      expect(r.shortfallUsd).toBe(1);
      expect(sats(r.netBtc)).toBe(800_000);
    });

    it("GUILD_REWARD: comes off the members' part before the split", () => {
      const r = withFee("GUILD_REWARD");
      expect(sats(r.companyOutputBtc)).toBe(200_000);
      expect(r.companyUsd).toBe(200);
      expect(sats(r.netBtc)).toBe(799_000);
    });

    it("HIGGS tops up a fee the company output can't cover", () => {
      const r = run({ networkFeeBtc: 0.00001, feePayer: "HIGGS" });
      expect(r.companyOutputBtc).toBe(0);
      expect(sats(r.feeTopUpBtc)).toBe(1_000);
    });
  });

  describe("holds", () => {
    it("holds after a recent split change", () => {
      const r = run({ splitUpdatedAt: new Date("2026-11-03T00:00:00Z") });
      expect(r.holdReasons).toEqual([
        "The reward split changed less than 24 hours ago",
      ]);
    });

    it("holds when the coin received doesn't match Luxor's record", () => {
      const r = run({ receivedBtc: 0.0099 });
      expect(r.holdReasons[0]).toMatch(/Received 0.00990000 BTC/);
      expect(run({ receivedBtc: 0.01 }).holdReasons).toEqual([]);
    });

    it("passes outside reasons through", () => {
      const r = run({ externalHolds: ["Waiting for October"] });
      expect(r.holdReasons).toEqual(["Waiting for October"]);
      expect(r.paidBtc).toBe(0);
    });
  });
});

describe("isFullSplit", () => {
  it("accepts exactly 100 at 4 decimals", () => {
    expect(isFullSplit([33.3333, 33.3333, 33.3334])).toBe(true);
    expect(isFullSplit([50, 50])).toBe(true);
    expect(isFullSplit([50, 49.9999])).toBe(false);
    expect(isFullSplit([])).toBe(false);
  });
});
