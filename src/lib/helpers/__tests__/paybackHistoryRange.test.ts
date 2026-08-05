import { describe, it, expect } from "vitest";
import {
  getRangeStartDate,
  isPaybackHistoryRange,
} from "@/lib/helpers/paybackHistoryRange";

// Fixed "now" so tests are deterministic regardless of when they run.
const NOW = new Date("2026-08-05T15:30:00Z");

describe("getRangeStartDate", () => {
  it("returns null for ALL (no lower bound)", () => {
    expect(getRangeStartDate("ALL", NOW)).toBeNull();
  });

  it("returns a UTC-midnight cutoff 29 days back (inclusive) for 30D", () => {
    const start = getRangeStartDate("30D", NOW);
    expect(start?.toISOString()).toBe("2026-07-07T00:00:00.000Z");
  });

  it("returns a UTC-midnight cutoff 89 days back (inclusive) for 90D", () => {
    const start = getRangeStartDate("90D", NOW);
    expect(start?.toISOString()).toBe("2026-05-08T00:00:00.000Z");
  });

  it("returns a UTC-midnight cutoff 364 days back (inclusive) for 1Y", () => {
    const start = getRangeStartDate("1Y", NOW);
    expect(start?.toISOString()).toBe("2025-08-06T00:00:00.000Z");
  });

  it("ignores the time-of-day component of `now`", () => {
    const morning = getRangeStartDate("30D", new Date("2026-08-05T00:00:01Z"));
    const night = getRangeStartDate("30D", new Date("2026-08-05T23:59:59Z"));
    expect(morning?.toISOString()).toBe(night?.toISOString());
  });
});

describe("isPaybackHistoryRange", () => {
  it("accepts the four supported range values", () => {
    expect(isPaybackHistoryRange("30D")).toBe(true);
    expect(isPaybackHistoryRange("90D")).toBe(true);
    expect(isPaybackHistoryRange("1Y")).toBe(true);
    expect(isPaybackHistoryRange("ALL")).toBe(true);
  });

  it("rejects anything else, including null", () => {
    expect(isPaybackHistoryRange("7D")).toBe(false);
    expect(isPaybackHistoryRange("")).toBe(false);
    expect(isPaybackHistoryRange(null)).toBe(false);
  });
});
