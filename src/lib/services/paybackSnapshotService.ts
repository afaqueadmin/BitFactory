import { prisma } from "@/lib/prisma";
import { createLuxorClient } from "@/lib/luxor";
import {
  getOrCreatePaybackConfig,
  serializePaybackConfig,
} from "@/lib/paybackConfigHelpers";
import {
  buildSnapshotValues,
  SnapshotProfileConfig,
} from "@/lib/helpers/paybackSnapshot";
import type { PaybackDailySnapshot } from "@prisma/client";

/** Pool-wide subaccount used for hashprice, matching /api/pool-hashprice-live
 * and /api/hashprice-history so figures stay consistent across the app. */
const POOL_WIDE_SUBACCOUNT = "higgs";

export const toUtcDateOnly = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

export const formatUtcDateKey = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** Returns UTC-midnight of "yesterday" relative to `now` — the most recent
 * fully-completed UTC calendar day. */
export const getPreviousCompletedUtcDay = (now: Date = new Date()): Date => {
  const today = toUtcDateOnly(now);
  today.setUTCDate(today.getUTCDate() - 1);
  return today;
};

export const fetchBtcDailyCloseUsd = async (dateUtc: Date): Promise<number> => {
  const dayStartMs = Date.UTC(
    dateUtc.getUTCFullYear(),
    dateUtc.getUTCMonth(),
    dateUtc.getUTCDate(),
  );
  // Use Binance's public market-data mirror (not api.binance.com) — Vercel's
  // serverless functions run from US datacenter IPs, which api.binance.com
  // geo-blocks with HTTP 451. data-api.binance.vision serves the same public
  // kline data without that restriction.
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${dayStartMs}&limit=1`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Binance klines request failed with status ${response.status}`,
    );
  }

  const candles = (await response.json()) as unknown[];
  const candle = candles[0] as unknown[] | undefined;
  const close = candle ? Number(candle[4]) : NaN;

  if (!Number.isFinite(close)) {
    throw new Error(
      `Binance klines response did not include a valid close price for ${formatUtcDateKey(dateUtc)}`,
    );
  }

  return close;
};

// Matches the payback-analysis table's live BREAKEVEN column, which reads
// this same pool-wide summary endpoint via /api/pool-hashprice-live. Note
// this endpoint has no date range — it only ever returns Luxor's current
// live hashprice, so any date passed in gets stamped with today's live
// value rather than a true historical figure for that day.
export const fetchDailyHashprice = async (dateUtc: Date): Promise<number> => {
  const dateKey = formatUtcDateKey(dateUtc);
  const luxorClient = createLuxorClient(POOL_WIDE_SUBACCOUNT);

  const summaryResponse = await luxorClient.getSummary("BTC", {
    subaccount_names: POOL_WIDE_SUBACCOUNT,
  });

  const hashprice = summaryResponse.hashprice?.[0]?.value;

  if (!(typeof hashprice === "number" && hashprice > 0)) {
    throw new Error(`No Luxor hashprice data available for ${dateKey}`);
  }

  return hashprice;
};

export const getClientAndCompanyConfigs = async (): Promise<{
  client: SnapshotProfileConfig;
  company: SnapshotProfileConfig;
}> => {
  const [clientConfig, companyConfig] = await Promise.all([
    getOrCreatePaybackConfig("CLIENT"),
    getOrCreatePaybackConfig("COMPANY"),
  ]);

  return {
    client: serializePaybackConfig(clientConfig),
    company: serializePaybackConfig(companyConfig),
  };
};

const SNAPSHOT_NUMERIC_FIELDS = [
  "btcCloseUsd",
  "hashpriceBtcPerPhDay",
  "clientS21ProStockBreakeven",
  "clientS21ProCustomBreakeven",
  "clientS21XpStockBreakeven",
  "clientS21XpCustomBreakeven",
  "companyS21ProStockBreakeven",
  "companyS21ProCustomBreakeven",
  "companyS21XpStockBreakeven",
  "companyS21XpCustomBreakeven",
] as const;

export const isValidSnapshot = (
  snapshot: Pick<
    PaybackDailySnapshot,
    (typeof SNAPSHOT_NUMERIC_FIELDS)[number]
  >,
): boolean =>
  SNAPSHOT_NUMERIC_FIELDS.every((field) => {
    const value = snapshot[field];
    if (value === null || value === undefined) return false;
    return Number.isFinite(Number(value));
  });

export interface SnapshotUpsertResult {
  status: "written" | "skipped";
  date: string;
}

/**
 * Upserts the payback daily snapshot for a single UTC calendar day.
 * - If a valid snapshot already exists for that day, it is left untouched.
 * - Otherwise, it fetches BTC close (Binance) + hashprice (Luxor) + current
 *   CLIENT/COMPANY config and writes/overwrites the row.
 * Shared by both the daily cron and the admin backfill endpoint so the
 * "don't overwrite valid data" rule only lives in one place.
 */
export const upsertSnapshotForDate = async (
  dateInput: Date,
): Promise<SnapshotUpsertResult> => {
  const dateUtc = toUtcDateOnly(dateInput);
  const dateKey = formatUtcDateKey(dateUtc);

  const existing = await prisma.paybackDailySnapshot.findUnique({
    where: { date: dateUtc },
  });

  if (existing && isValidSnapshot(existing)) {
    return { status: "skipped", date: dateKey };
  }

  const [btcCloseUsd, hashpriceBtcPerPhDay, configs] = await Promise.all([
    fetchBtcDailyCloseUsd(dateUtc),
    fetchDailyHashprice(dateUtc),
    getClientAndCompanyConfigs(),
  ]);

  const values = buildSnapshotValues({
    btcCloseUsd,
    hashpriceBtcPerPhDay,
    clientConfig: configs.client,
    companyConfig: configs.company,
  });

  await prisma.paybackDailySnapshot.upsert({
    where: { date: dateUtc },
    create: { date: dateUtc, ...values },
    update: { ...values },
  });

  return { status: "written", date: dateKey };
};
