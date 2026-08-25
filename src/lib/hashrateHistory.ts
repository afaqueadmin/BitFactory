/**
 * Hashrate history — pool fetchers.
 *
 * Window/tick/unit maths live in ./hashrateWindows (pure + isomorphic, so the
 * chart component can share them). This module is server-only: it holds the
 * pool clients and the cache.
 *
 * ────────────────────────────────────────────────────────────────────────
 * API constraints below were VERIFIED against the live APIs (2026-08-11,
 * re-checked 2026-08-12), not taken from vendor docs. Re-check before
 * loosening any of them.
 *
 * LUXOR  GET /pool/hashrate-efficiency/BTC
 *   • start_date must be after 2023-01-01 (400 otherwise) — DATA_FLOOR.
 *   • tick_size=5m : window must be within the last 7 days  (400 otherwise)
 *   • tick_size=1h : window must be within the last 30 days (400 otherwise)
 *   • tick_size=1d/1w/1M : no range limit observed
 *   • No per-request range cap: a 588-day range returned in one unpaginated
 *     call. History reaches back to the subaccount's first hashing day.
 *   • efficiency is a 0..1 fraction, so it is scaled to percent here.
 *   • hashrate is a decimal STRING in H/s.
 *   • Rate limiting is real (429s under bursts) and returns no RateLimit-*
 *     headers — hence the caching.
 *
 * BRAIINS  GET /accounts/hash_rate_daily/json/btc
 *   • from/to are silently IGNORED; always returns a fixed rolling window
 *     (~188 days). We slice to the requested window ourselves.
 *   • Daily granularity only — a 1D window yields a single point.
 *   • No efficiency metric exists, so efficiency is null.
 *   • hash_rate_24h is in Gh/s and is converted to H/s to match Luxor.
 */

import { createLuxorClient } from "./luxor";
import { createBraiinsClient } from "./braiins";
import { poolDataCache } from "./cache";
import { prisma } from "./prisma";
import { DATA_FLOOR, TickSize, Window } from "./hashrateWindows";

/** UTC midnight of the current day — the cron only ever writes fully-closed
 * prior days, so anything from this point forward always needs a live call. */
const todayUtc = (): Date => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
};

/**
 * Lower bound for a DB day-range query, widened by a day for the same reason
 * fetchLuxorSeriesLive pads its start: `window.start` is an instant in the
 * VIEWER's local timezone and can land mid-UTC-day, which would otherwise
 * exclude that day's own row (a `@db.Date` column is always exact UTC
 * midnight, so a `gte` compare against a non-midnight instant silently drops
 * it). The final `.filter()` against the real window trims anything the
 * padding over-fetched, so this is safe to over-ask.
 */
const dbRangeStart = (window: Window): Date => {
  const flooredStart = window.start < DATA_FLOOR ? DATA_FLOOR : window.start;
  const padded = new Date(flooredStart.getTime() - 86_400_000);
  return padded < DATA_FLOOR ? new Date(DATA_FLOOR) : padded;
};

export interface HashratePoint {
  /** Epoch milliseconds (UTC). */
  t: number;
  /** Hashrate in H/s. */
  hashrate: number;
  /** Share efficiency as a percentage (0-100), or null if the pool has none. */
  efficiency: number | null;
}

export interface UptimePoint {
  /** Epoch milliseconds (UTC), always a day boundary. */
  t: number;
  /** Uptime as a percentage (0-100). */
  uptime: number;
}

export interface PoolSeries {
  /** False when the user has no auth for this pool. */
  available: boolean;
  points: HashratePoint[];
  /**
   * Uptime is a separate series because the pool only serves it daily, so its
   * timestamps rarely line up with the hashrate points (which may be 5m/1h).
   */
  uptimePoints: UptimePoint[];
  /** Finest granularity this pool actually returned. */
  granularity: TickSize;
  /** Whether this pool reports share efficiency at all. */
  hasEfficiency: boolean;
  /** Whether this pool reports uptime at all. */
  hasUptime: boolean;
  /** Human-readable caveat to surface in the UI, if any. */
  note?: string;
  /** Set when the pool call failed; the other pool can still render. */
  error?: string;
}

/** Cache TTL per tick — 5m data goes stale fast, daily data does not. */
const TICK_TTL_SECONDS: Record<TickSize, number> = {
  "5m": 300,
  "1h": 900,
  "1d": 3600,
};

export const cacheTtlForTick = (tick: TickSize): number =>
  TICK_TTL_SECONDS[tick];

/** Luxor wants YYYY-MM-DD. UTC, matching the date_time it returns. */
const toApiDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Fetch a Luxor subaccount's hashrate + efficiency series.
 *
 * Luxor's date bounds are day-granular, so a 5m/1h request returns whole
 * days; points are filtered to the exact window afterwards so the chart
 * matches its own range label.
 *
 * The START is widened by a day because the window is expressed in the
 * viewer's local timezone and can straddle a UTC date boundary. The END is
 * NOT padded and is clamped to today: Luxor rejects a future end_date with
 * "End date must be in the past or today" (verified 2026-08-12), which would
 * 400 every live window. end_date is inclusive of that whole day anyway, so
 * no padding is needed there.
 */
/**
 * Fetch a Luxor subaccount's hashrate + efficiency series, DB-first.
 *
 * Only tick="1d" requests can be served from PoolSubaccountDailySnapshot —
 * that table only ever holds one point per day, so a 5m/1h request (short
 * windows: 1D/1W/1M periods) always falls through to the live path
 * unchanged. For 1d requests, every fully-closed prior day comes from the
 * DB (written by cron_pool_daily_snapshot) and only "today" (if the window
 * reaches that far) is fetched live.
 */
export async function fetchLuxorSeries(
  subaccountName: string,
  window: Window,
  tick: TickSize,
  poolSubaccountId: string | null,
): Promise<HashratePoint[]> {
  if (tick !== "1d" || !poolSubaccountId) {
    return fetchLuxorSeriesLive(subaccountName, window, tick);
  }

  const today = todayUtc();

  const dbRows = await prisma.poolSubaccountDailySnapshot.findMany({
    where: {
      poolSubaccountId,
      date: { gte: dbRangeStart(window), lt: today },
      hashrate: { not: null },
    },
    orderBy: { date: "asc" },
  });

  const points: HashratePoint[] = dbRows.map((r) => ({
    t: r.date.getTime(),
    hashrate: Number(r.hashrate),
    efficiency: r.efficiency !== null ? Number(r.efficiency) : null,
  }));

  if (window.end.getTime() >= today.getTime()) {
    try {
      const todayPoints = await fetchLuxorSeriesLive(
        subaccountName,
        { start: today, end: window.end },
        "1d",
      );
      points.push(...todayPoints);
    } catch (error) {
      console.error(
        `[HashrateHistory] Live "today" fetch failed for ${subaccountName}:`,
        error,
      );
    }
  }

  return points
    .filter((p) => p.t >= window.start.getTime() && p.t < window.end.getTime())
    .sort((a, b) => a.t - b.t);
}

async function fetchLuxorSeriesLive(
  subaccountName: string,
  window: Window,
  tick: TickSize,
): Promise<HashratePoint[]> {
  const from = window.start < DATA_FLOOR ? DATA_FLOOR : window.start;

  const paddedStart = new Date(from.getTime() - 86_400_000);
  const startDate = toApiDate(
    paddedStart < DATA_FLOOR ? DATA_FLOOR : paddedStart,
  );

  const now = new Date();
  const endDate = toApiDate(window.end > now ? now : window.end);

  const client = createLuxorClient(subaccountName);
  const points: HashratePoint[] = [];

  let pageNumber = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await client.getHashrateEfficiency("BTC", {
      subaccount_names: subaccountName,
      start_date: startDate,
      end_date: endDate,
      tick_size: tick,
      page_size: 1000,
      page_number: pageNumber,
    });

    for (const point of response.hashrate_efficiency || []) {
      const t = new Date(point.date_time).getTime();
      if (!Number.isFinite(t)) continue;

      points.push({
        t,
        hashrate: parseFloat(point.hashrate || "0") || 0,
        // Luxor reports efficiency as a 0..1 fraction.
        efficiency:
          typeof point.efficiency === "number" ? point.efficiency * 100 : null,
      });
    }

    hasMore = response.pagination?.next_page_url != null;
    pageNumber++;

    // Defensive: never spin more than 20 pages (20k points) on one window.
    if (pageNumber > 20) break;
  }

  return points
    .filter((p) => p.t >= window.start.getTime() && p.t < window.end.getTime())
    .sort((a, b) => a.t - b.t);
}

/**
 * Fetch a Luxor subaccount's uptime series.
 *
 * ⚠️ VERIFIED 2026-08-14: /pool/uptime/BTC accepts ONLY tick_size 1d|1w|1M.
 * Both 5m and 1h are rejected outright ("Invalid option: expected one of
 * 1d|1w|1M"), so uptime has no intraday resolution at all — it is always
 * fetched daily and overlaid on whatever tick the hashrate chart is using.
 * `uptime` comes back as a 0..1 fraction, like efficiency, and is scaled to
 * percent here. Paginates identically to hashrate-efficiency and reaches back
 * to the subaccount's first hashing day.
 */
/**
 * Fetch a Luxor subaccount's uptime series, DB-first.
 *
 * Unlike hashrate, Luxor uptime is ALWAYS daily (tick_size=1d is the only
 * option the endpoint accepts), so this can be DB-sourced on every request
 * regardless of what tick the hashrate series is using — only "today" (if
 * the window reaches that far) needs a live call.
 */
export async function fetchLuxorUptime(
  subaccountName: string,
  window: Window,
  poolSubaccountId: string | null,
): Promise<UptimePoint[]> {
  if (!poolSubaccountId) {
    return fetchLuxorUptimeLive(subaccountName, window);
  }

  const today = todayUtc();

  const dbRows = await prisma.poolSubaccountDailySnapshot.findMany({
    where: {
      poolSubaccountId,
      date: { gte: dbRangeStart(window), lt: today },
      uptime: { not: null },
    },
    orderBy: { date: "asc" },
  });

  const points: UptimePoint[] = dbRows.map((r) => ({
    t: r.date.getTime(),
    uptime: Number(r.uptime),
  }));

  if (window.end.getTime() >= today.getTime()) {
    try {
      const todayPoints = await fetchLuxorUptimeLive(subaccountName, {
        start: today,
        end: window.end,
      });
      points.push(...todayPoints);
    } catch (error) {
      console.error(
        `[HashrateHistory] Live "today" uptime fetch failed for ${subaccountName}:`,
        error,
      );
    }
  }

  return points
    .filter((p) => p.t >= window.start.getTime() && p.t < window.end.getTime())
    .sort((a, b) => a.t - b.t);
}

async function fetchLuxorUptimeLive(
  subaccountName: string,
  window: Window,
): Promise<UptimePoint[]> {
  const from = window.start < DATA_FLOOR ? DATA_FLOOR : window.start;
  const paddedStart = new Date(from.getTime() - 86_400_000);
  const startDate = toApiDate(
    paddedStart < DATA_FLOOR ? DATA_FLOOR : paddedStart,
  );

  const now = new Date();
  const endDate = toApiDate(window.end > now ? now : window.end);

  const client = createLuxorClient(subaccountName);
  const points: UptimePoint[] = [];

  let pageNumber = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await client.getUptime("BTC", {
      subaccount_names: subaccountName,
      start_date: startDate,
      end_date: endDate,
      tick_size: "1d",
      page_size: 1000,
      page_number: pageNumber,
    });

    for (const point of response.uptime || []) {
      const t = new Date(point.date_time).getTime();
      if (!Number.isFinite(t) || typeof point.uptime !== "number") continue;
      points.push({ t, uptime: point.uptime * 100 });
    }

    hasMore = response.pagination?.next_page_url != null;
    pageNumber++;
    if (pageNumber > 20) break;
  }

  return points
    .filter((p) => p.t >= window.start.getTime() && p.t < window.end.getTime())
    .sort((a, b) => a.t - b.t);
}

/**
 * Fetch the Braiins daily series.
 *
 * The API ignores date params and always returns its full rolling window, so
 * the whole series is fetched once, cached per user, and sliced locally.
 */
/**
 * Fetch a Braiins subaccount's daily hashrate series, DB-first.
 *
 * The live endpoint always returns a fixed ~188-day rolling window (see
 * module note above) regardless of what's asked for, so it's fetched once
 * and cached as before. Anything OLDER than that rolling window's earliest
 * point now comes from PoolSubaccountDailySnapshot — that's real history
 * the live API itself can no longer reach, extending Braiins coverage past
 * its own retention limit. If the live call fails outright, DB data is used
 * for the whole window rather than returning nothing.
 */
export async function fetchBraiinsSeries(
  apiToken: string,
  userId: string,
  window: Window,
  poolSubaccountId: string | null,
): Promise<HashratePoint[]> {
  const cacheKey = `hashrate_history_braiins_full_${userId}`;
  let liveSeries = poolDataCache.get(cacheKey) as HashratePoint[] | null;

  if (!liveSeries) {
    try {
      const client = createBraiinsClient(apiToken, userId);
      const response = await client.getDailyHashrate();

      liveSeries = (response?.btc || [])
        .map((day) => ({
          t: day.date * 1000,
          // Braiins reports Gh/s; convert to H/s to match Luxor.
          hashrate: (Number(day.hash_rate_24h) || 0) * 1e9,
          efficiency: null,
        }))
        .filter((p) => Number.isFinite(p.t))
        .sort((a, b) => a.t - b.t);

      poolDataCache.set(cacheKey, liveSeries, 900);
    } catch (error) {
      console.error(
        `[HashrateHistory] Braiins live fetch failed, falling back to DB only:`,
        error,
      );
      liveSeries = [];
    }
  }

  let dbPoints: HashratePoint[] = [];
  if (poolSubaccountId) {
    const rangeStart = dbRangeStart(window);
    const dbUpperBound = liveSeries.length
      ? new Date(liveSeries[0].t)
      : new Date(window.end.getTime() + 1);

    if (rangeStart.getTime() < dbUpperBound.getTime()) {
      const dbRows = await prisma.poolSubaccountDailySnapshot.findMany({
        where: {
          poolSubaccountId,
          date: { gte: rangeStart, lt: dbUpperBound },
          hashrate: { not: null },
        },
        orderBy: { date: "asc" },
      });
      dbPoints = dbRows.map((r) => ({
        t: r.date.getTime(),
        hashrate: Number(r.hashrate),
        efficiency: null,
      }));
    }
  }

  return [...dbPoints, ...liveSeries].filter(
    (p) => p.t >= window.start.getTime() && p.t < window.end.getTime(),
  );
}

/**
 * Earliest day this Luxor subaccount ever hashed.
 *
 * Uses tick_size=1M over the full retained range, so it is ~9 points rather
 * than thousands, and caches for a day. The UI needs it to know when to stop
 * offering "older" pages. Note 1M buckets land on month starts, so this can
 * be up to a month earlier than the true first day — deliberately generous,
 * since erring late would hide real history.
 */
export async function fetchLuxorEarliestData(
  subaccountName: string,
): Promise<number | null> {
  const cacheKey = `hashrate_history_earliest_${subaccountName}`;
  const cached = poolDataCache.get(cacheKey) as number | null;
  if (cached !== null && cached !== undefined) return cached;

  try {
    const client = createLuxorClient(subaccountName);
    const response = await client.getHashrateEfficiency("BTC", {
      subaccount_names: subaccountName,
      start_date: toApiDate(DATA_FLOOR),
      end_date: toApiDate(new Date()),
      tick_size: "1M",
      page_size: 1000,
    });

    const timestamps = (response.hashrate_efficiency || [])
      .map((p) => new Date(p.date_time).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);

    const earliest = timestamps.length ? timestamps[0] : null;
    poolDataCache.set(cacheKey, earliest, 86400);
    return earliest;
  } catch (error) {
    console.error(
      `[HashrateHistory] Could not resolve earliest data for ${subaccountName}:`,
      error,
    );
    return null;
  }
}

/**
 * Fetch a single worker's hashrate + efficiency series, live.
 *
 * GET /pool/workers-hashrate-efficiency/BTC/:subaccountName
 *
 * VERIFIED live 2026-08-17:
 *   • tick_size accepts ONLY "1d" or "1h" — "5m" is rejected outright with
 *     "expected one of \"1d\"|\"1h\"" (no 5m tier at worker level at all).
 *   • tick_size=1h: start_date must be within the last 3 months (~92 days,
 *     binary-searched) — a stricter, independent limit from the subaccount
 *     endpoint's own 30-day 1h limit.
 *   • Response shape: { hashrate_efficiency_revenue: { [workerName]: [{
 *     date_time, hashrate, efficiency, est_revenue }] } } — no firmware,
 *     stale/rejected shares, or status here, same as the daily backfill call.
 *
 * Start padding mirrors fetchLuxorSeriesLive for the same reason: the window
 * is expressed in the viewer's local timezone and can straddle a UTC day.
 */
async function fetchWorkerLuxorSeriesLive(
  subaccountName: string,
  workerName: string,
  window: Window,
  tick: TickSize,
): Promise<HashratePoint[]> {
  const from = window.start < DATA_FLOOR ? DATA_FLOOR : window.start;
  const paddedStart = new Date(from.getTime() - 86_400_000);
  const startDate = toApiDate(
    paddedStart < DATA_FLOOR ? DATA_FLOOR : paddedStart,
  );

  const now = new Date();
  const endDate = toApiDate(window.end > now ? now : window.end);

  const client = createLuxorClient(subaccountName);
  const response = (await client.getWorkersHashrateEfficiency(
    "BTC",
    subaccountName,
    {
      worker_names: workerName,
      tick_size: tick,
      start_date: startDate,
      end_date: endDate,
      page_size: 5000,
    },
  )) as {
    hashrate_efficiency_revenue?: Record<
      string,
      Array<{ date_time: string; hashrate: string; efficiency: number }>
    >;
  };

  const rawPoints = response.hashrate_efficiency_revenue?.[workerName] || [];

  return rawPoints
    .map((p) => ({
      t: new Date(p.date_time).getTime(),
      hashrate: parseFloat(p.hashrate || "0") || 0,
      efficiency: typeof p.efficiency === "number" ? p.efficiency * 100 : null,
    }))
    .filter(
      (p) =>
        Number.isFinite(p.t) &&
        p.t >= window.start.getTime() &&
        p.t < window.end.getTime(),
    )
    .sort((a, b) => a.t - b.t);
}

/**
 * Fetch a single worker's hashrate + efficiency series, DB-first.
 *
 * Only tick="1d" can be served from PoolWorkerDailyMetric — worker-level
 * data is daily-only in the DB (no 1h rows exist there; 1h is a live-only
 * tier, capped at ~91 days back by Luxor itself, see fetchWorkerLuxorSeriesLive).
 * For 1d requests, every fully-closed prior day comes from the DB and only
 * "today" (if the window reaches that far) is fetched live.
 */
export async function fetchWorkerLuxorSeries(
  subaccountName: string,
  workerName: string,
  window: Window,
  tick: TickSize,
  poolSubaccountId: string | null,
): Promise<HashratePoint[]> {
  if (tick !== "1d" || !poolSubaccountId) {
    return fetchWorkerLuxorSeriesLive(subaccountName, workerName, window, tick);
  }

  const today = todayUtc();

  const dbRows = await prisma.poolWorkerDailyMetric.findMany({
    where: {
      poolSubaccountId,
      workerName,
      date: { gte: dbRangeStart(window), lt: today },
      hashrate: { not: null },
    },
    orderBy: { date: "asc" },
  });

  const points: HashratePoint[] = dbRows.map((r) => ({
    t: r.date.getTime(),
    hashrate: Number(r.hashrate),
    efficiency: r.efficiency !== null ? Number(r.efficiency) : null,
  }));

  if (window.end.getTime() >= today.getTime()) {
    try {
      const todayPoints = await fetchWorkerLuxorSeriesLive(
        subaccountName,
        workerName,
        { start: today, end: window.end },
        "1d",
      );
      points.push(...todayPoints);
    } catch (error) {
      console.error(
        `[HashrateHistory] Live "today" fetch failed for worker ${workerName}:`,
        error,
      );
    }
  }

  return points
    .filter((p) => p.t >= window.start.getTime() && p.t < window.end.getTime())
    .sort((a, b) => a.t - b.t);
}

/**
 * Earliest day this worker has a recorded daily metric, from the DB only
 * (no live equivalent is fetched — unlike fetchLuxorEarliestData, an extra
 * live call per worker per chart load isn't worth it for a single miner's
 * paging affordance). Returns null if the worker has no DB rows yet, which
 * the UI treats as "no known limit" rather than "no history".
 */
export async function fetchWorkerEarliestData(
  poolSubaccountId: string,
  workerName: string,
): Promise<number | null> {
  const earliest = await prisma.poolWorkerDailyMetric.findFirst({
    where: { poolSubaccountId, workerName },
    orderBy: { date: "asc" },
    select: { date: true },
  });
  return earliest ? earliest.date.getTime() : null;
}
