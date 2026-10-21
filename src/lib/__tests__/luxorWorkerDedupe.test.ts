import { describe, expect, it } from "vitest";
import {
  countDistinctWorkers,
  dedupeWorkers,
  pickWorkerForMiner,
} from "@/lib/luxorWorkerDedupe";

// The real case behind this module: 10x12x0x69 moved from subaccount
// "higgs" to "higgse"; Luxor lists the old entry (INACTIVE) first.
const shadow = {
  subaccount_name: "higgs",
  name: "10x12x0x69",
  status: "INACTIVE",
  last_share_time: "2026-10-16T14:56:12.000Z",
};
const live = {
  subaccount_name: "higgse",
  name: "10x12x0x69",
  status: "ACTIVE",
  last_share_time: "2026-10-21T08:20:59.000Z",
};

describe("pickWorkerForMiner", () => {
  it("prefers the ACTIVE entry regardless of response order", () => {
    expect(pickWorkerForMiner([shadow, live], "10x12x0x69")).toBe(live);
    expect(pickWorkerForMiner([live, shadow], "10x12x0x69")).toBe(live);
  });

  it("falls back to the most recent share when none is ACTIVE", () => {
    const older = { ...shadow, last_share_time: "2026-10-01T00:00:00.000Z" };
    expect(pickWorkerForMiner([older, shadow], "10x12x0x69")).toBe(shadow);
  });

  it("matches names trimmed and case-insensitive", () => {
    expect(pickWorkerForMiner([live], " 10X12X0X69 ")).toBe(live);
  });

  it("returns undefined when the miner is not listed", () => {
    expect(pickWorkerForMiner([live], "10x12x0x70")).toBeUndefined();
  });
});

describe("dedupeWorkers / countDistinctWorkers", () => {
  const other = { ...shadow, name: "10x12x0x70" };

  it("collapses a moved miner to one ACTIVE row", () => {
    expect(dedupeWorkers([shadow, live, other])).toEqual([live, other]);
    expect(countDistinctWorkers([shadow, live, other])).toEqual({
      active: 1,
      inactive: 1,
    });
  });

  it("keeps same-named miners apart when the key includes the owner", () => {
    const owner: Record<string, string> = { higgs: "u1", higgse: "u2" };
    const key = (w: { subaccount_name: string; name: string }) =>
      `${owner[w.subaccount_name]}::${w.name}`;
    expect(dedupeWorkers([shadow, live], key)).toHaveLength(2);
    expect(countDistinctWorkers([shadow, live], key)).toEqual({
      active: 1,
      inactive: 1,
    });
  });
});
