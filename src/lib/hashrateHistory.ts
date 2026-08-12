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
import { DATA_FLOOR, TickSize, Window } from "./hashrateWindows";

export interface HashratePoint {
  /** Epoch milliseconds (UTC). */
  t: number;
  /** Hashrate in H/s. */
  hashrate: number;
  /** Share efficiency as a percentage (0-100), or null if the pool has none. */
  efficiency: number | null;
}

export interface PoolSeries {
  /** False when the user has no auth for this pool. */
  available: boolean;
  points: HashratePoint[];
  /** Finest granularity this pool actually returned. */
  granularity: TickSize;
  /** Whether this pool reports share efficiency at all. */
  hasEfficiency: boolean;
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
export async function fetchLuxorSeries(
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
    .filter((p) => p.t >= window.start.getTime() && p.t <= window.end.getTime())
    .sort((a, b) => a.t - b.t);
}

/**
 * Fetch the Braiins daily series.
 *
 * The API ignores date params and always returns its full rolling window, so
 * the whole series is fetched once, cached per user, and sliced locally.
 */
export async function fetchBraiinsSeries(
  apiToken: string,
  userId: string,
  window: Window,
): Promise<HashratePoint[]> {
  const cacheKey = `hashrate_history_braiins_full_${userId}`;
  let series = poolDataCache.get(cacheKey) as HashratePoint[] | null;

  if (!series) {
    const client = createBraiinsClient(apiToken, userId);
    const response = await client.getDailyHashrate();

    series = (response?.btc || [])
      .map((day) => ({
        t: day.date * 1000,
        // Braiins reports Gh/s; convert to H/s to match Luxor.
        hashrate: (Number(day.hash_rate_24h) || 0) * 1e9,
        efficiency: null,
      }))
      .filter((p) => Number.isFinite(p.t))
      .sort((a, b) => a.t - b.t);

    poolDataCache.set(cacheKey, series, 900);
  }

  return series.filter(
    (p) => p.t >= window.start.getTime() && p.t <= window.end.getTime(),
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
