import { describe, expect, it } from "vitest";
import {
  HALVING_INTERVAL,
  TARGET_BLOCK_TIME_MS,
  getBlockReward,
  getCirculatingSupply,
  getNextHalving,
} from "../bitcoinNetwork";

describe("getBlockReward", () => {
  it("returns the subsidy for each halving epoch", () => {
    expect(getBlockReward(0)).toBe(50);
    expect(getBlockReward(209_999)).toBe(50);
    expect(getBlockReward(210_000)).toBe(25);
    expect(getBlockReward(420_000)).toBe(12.5);
    expect(getBlockReward(630_000)).toBe(6.25);
    expect(getBlockReward(840_000)).toBe(3.125);
  });

  it("holds the subsidy steady within an epoch", () => {
    // Current epoch: the 2024 halving through the next one.
    expect(getBlockReward(961_992)).toBe(3.125);
    expect(getBlockReward(1_049_999)).toBe(3.125);
    expect(getBlockReward(1_050_000)).toBe(1.5625);
  });

  it("terminates at zero once the subsidy rounds below one satoshi", () => {
    expect(getBlockReward(33 * HALVING_INTERVAL)).toBe(0);
    expect(getBlockReward(64 * HALVING_INTERVAL)).toBe(0);
  });
});

describe("getCirculatingSupply", () => {
  it("sums a whole epoch of issuance", () => {
    expect(getCirculatingSupply(210_000)).toBe(210_000 * 50);
  });

  it("accumulates across epochs", () => {
    // 210k blocks at 50 BTC, then 210k at 25 BTC.
    expect(getCirculatingSupply(420_000)).toBe(210_000 * 50 + 210_000 * 25);
  });

  it("matches the observed supply at a known height", () => {
    // Theoretical issuance runs a little above true circulating supply, since
    // some early coinbase outputs were never claimable.
    const supply = getCirculatingSupply(961_992);
    expect(supply).toBeCloseTo(20_068_725, 0);
    expect(supply).toBeLessThan(21_000_000);
  });

  it("never exceeds the 21 million cap", () => {
    expect(getCirculatingSupply(100 * HALVING_INTERVAL)).toBeLessThanOrEqual(
      21_000_000,
    );
  });
});

describe("getNextHalving", () => {
  it("targets the next halving boundary", () => {
    const result = getNextHalving(961_992);

    expect(result.height).toBe(1_050_000);
    expect(result.blocksRemaining).toBe(88_008);
  });

  it("treats a halving block itself as the start of the next epoch", () => {
    const result = getNextHalving(840_000);

    expect(result.height).toBe(1_050_000);
    expect(result.blocksRemaining).toBe(210_000);
  });

  it("extrapolates the date at the 10 minute target", () => {
    const before = Date.now();
    const result = getNextHalving(961_992);
    const after = Date.now();

    const expectedFrom = before + 88_008 * TARGET_BLOCK_TIME_MS;
    const expectedTo = after + 88_008 * TARGET_BLOCK_TIME_MS;

    expect(result.estimatedDate).toBeGreaterThanOrEqual(expectedFrom);
    expect(result.estimatedDate).toBeLessThanOrEqual(expectedTo);
  });
});
