/**
 * Hashrate chart window maths — pure, isomorphic, no server imports.
 *
 * This module is deliberately free of prisma/axios/pool clients so the chart
 * component can import it directly. Window boundaries are computed in the
 * BROWSER's local timezone and sent to the API as absolute instants: the
 * server runs in UTC, so a server-computed "today" would start at 05:00 for a
 * GMT+5 viewer and the buckets would not line up with Luxor's watcher.
 *
 * Bucketing matches Luxor's watcher, verified against it on 2026-08-12:
 *   1D → the calendar day        ("12 Aug")
 *   1W → Monday-to-Sunday week   ("10 Aug - 12 Aug", then "3 Aug - 9 Aug")
 * The current bucket is truncated at "now"; older buckets are whole.
 */

export const PERIODS = ["1D", "1W", "1M", "3M", "1Y", "ALL"] as const;
export type Period = (typeof PERIODS)[number];

export type TickSize = "5m" | "1h" | "1d";

/** Luxor rejects any start_date on or before 2023-01-01. */
export const DATA_FLOOR = new Date("2023-01-02T00:00:00.000Z");

const DAY_MS = 86_400_000;

export interface Window {
  start: Date;
  end: Date;
}

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Monday-aligned, matching Luxor's watcher. */
const startOfWeek = (d: Date) => {
  const s = startOfDay(d);
  const mondayIndex = (s.getDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0
  s.setDate(s.getDate() - mondayIndex);
  return s;
};

/**
 * The calendar bucket for a period, `offset` buckets back from now.
 * offset=0 is the current (truncated) bucket.
 */
export function bucketWindow(
  period: Period,
  offset: number = 0,
  now: Date = new Date(),
): Window {
  if (period === "ALL") {
    return { start: new Date(DATA_FLOOR), end: now };
  }

  let start: Date;
  let bucketEnd: Date;

  switch (period) {
    case "1D": {
      start = startOfDay(now);
      start.setDate(start.getDate() - offset);
      bucketEnd = new Date(start);
      bucketEnd.setDate(bucketEnd.getDate() + 1);
      break;
    }
    case "1W": {
      start = startOfWeek(now);
      start.setDate(start.getDate() - 7 * offset);
      bucketEnd = new Date(start);
      bucketEnd.setDate(bucketEnd.getDate() + 7);
      break;
    }
    case "1M": {
      start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      bucketEnd = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      break;
    }
    case "3M": {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), quarterStartMonth - 3 * offset, 1);
      bucketEnd = new Date(start.getFullYear(), start.getMonth() + 3, 1);
      break;
    }
    case "1Y": {
      start = new Date(now.getFullYear() - offset, 0, 1);
      bucketEnd = new Date(start.getFullYear() + 1, 0, 1);
      break;
    }
  }

  // The live bucket stops at now; past buckets run their full length.
  return { start, end: bucketEnd > now ? now : bucketEnd };
}

/**
 * Finest tick we'd like. With a period active this is fixed per period so the
 * resolution doesn't wobble as a bucket fills up; a custom range has no
 * period, so it is chosen from the span instead.
 */
const preferredTick = (period: Period | null, spanDays: number): TickSize => {
  if (period) {
    if (period === "1D") return "5m";
    if (period === "1W" || period === "1M") return "1h";
    return "1d";
  }
  if (spanDays <= 2) return "5m";
  if (spanDays <= 31) return "1h";
  return "1d";
};

/**
 * Max age (days) of a window START for each tick. Verified against Luxor:
 * a start_date exactly 7 days old was REJECTED for 5m, so these sit one day
 * inside the documented boundary.
 */
const TICK_MAX_AGE_DAYS: Record<TickSize, number> = {
  "5m": 6,
  "1h": 29,
  "1d": Infinity,
};

/**
 * Pick the finest tick that is legal for this window. Paging back past a
 * tick's retention would 400, so coarsen instead of failing: 5m → 1h → 1d.
 */
export function pickTick(
  window: Window,
  period: Period | null,
  now: Date = new Date(),
): { tick: TickSize; downgradedFrom?: TickSize } {
  const spanDays = (window.end.getTime() - window.start.getTime()) / DAY_MS;
  const ageDays = (now.getTime() - window.start.getTime()) / DAY_MS;

  const preferred = preferredTick(period, spanDays);
  const order: TickSize[] = ["5m", "1h", "1d"];
  const startIndex = order.indexOf(preferred);

  for (let i = startIndex; i < order.length; i++) {
    if (ageDays <= TICK_MAX_AGE_DAYS[order[i]]) {
      return {
        tick: order[i],
        downgradedFrom: i === startIndex ? undefined : preferred,
      };
    }
  }
  return {
    tick: "1d",
    downgradedFrom: preferred === "1d" ? undefined : preferred,
  };
}

/**
 * Hashrate display unit.
 *
 * Luxor switches later than a naive 1-PH/s threshold: its table shows
 * "1291.03 TH/s" (1.29 PH/s) but "16.91 PH/s" — i.e. it holds TH/s until the
 * number would exceed four integer digits. Verified against the watcher
 * 2026-08-12.
 */
export const resolveHashrateUnit = (maxHashrateHs: number) =>
  maxHashrateHs >= 1e16
    ? { label: "PH/s", divisor: 1e15 }
    : { label: "TH/s", divisor: 1e12 };

/** e.g. "GMT+5", "GMT+5:30", "GMT-4", "GMT" — the viewer's own offset. */
export function localOffsetLabel(date: Date = new Date()): string {
  const minutes = -date.getTimezoneOffset();
  if (minutes === 0) return "GMT";
  const sign = minutes > 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `GMT${sign}${hours}${mins ? `:${String(mins).padStart(2, "0")}` : ""}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-08-12 10:25", matching the watcher's table. */
export const formatTimestamp = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const dayMonth = (d: Date, withYear: boolean) =>
  d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });

/**
 * Range label for the toolbar.
 * "12 Aug" for a single day, "10 Aug - 12 Aug" for a span — same shape Luxor
 * uses. Years appear only when the range isn't wholly in the current year.
 */
export function formatRangeLabel(
  window: Window,
  period: Period | null,
  now: Date = new Date(),
): string {
  const { start, end } = window;

  // `end` is exclusive; step back a moment to name the last day it covers.
  const lastInstant = new Date(end.getTime() - 1);
  const needsYear =
    start.getFullYear() !== now.getFullYear() ||
    lastInstant.getFullYear() !== now.getFullYear();

  const sameDay =
    start.getFullYear() === lastInstant.getFullYear() &&
    start.getMonth() === lastInstant.getMonth() &&
    start.getDate() === lastInstant.getDate();

  if (period === "ALL") return "All time";
  if (sameDay) return dayMonth(start, needsYear);

  return `${dayMonth(start, needsYear)} - ${dayMonth(lastInstant, needsYear)}`;
}
