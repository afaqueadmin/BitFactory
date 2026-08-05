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

const extractDateKey = (value?: string | null): string | null => {
  if (!value) return null;
  if (value.includes("T")) return value.split("T")[0] || null;
  if (value.length >= 10) return value.slice(0, 10);
  return null;
};

export const fetchBtcDailyCloseUsd = async (dateUtc: Date): Promise<number> => {
  const dayStartMs = Date.UTC(
    dateUtc.getUTCFullYear(),
    dateUtc.getUTCMonth(),
    dateUtc.getUTCDate(),
  );
  const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${dayStartMs}&limit=1`;

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

export const fetchDailyHashprice = async (dateUtc: Date): Promise<number> => {
  const dateKey = formatUtcDateKey(dateUtc);
  const luxorClient = createLuxorClient(POOL_WIDE_SUBACCOUNT);

  const [revenueResponse, hashrateResponse] = await Promise.all([
    luxorClient.getRevenue("BTC", {
      subaccount_names: POOL_WIDE_SUBACCOUNT,
      start_date: dateKey,
      end_date: dateKey,
    }),
    luxorClient.getHashrateEfficiency("BTC", {
      subaccount_names: POOL_WIDE_SUBACCOUNT,
      start_date: dateKey,
      end_date: dateKey,
      tick_size: "1d",
    }),
  ]);

  const revenueEntry = revenueResponse.revenue?.find(
    (entry) => extractDateKey(entry.date_time) === dateKey,
  );
  const hashrateEntry = hashrateResponse.hashrate_efficiency?.find(
    (entry) => extractDateKey(entry.date_time) === dateKey,
  );

  const revenue = revenueEntry?.revenue?.revenue ?? 0;
  const hashrateRaw = hashrateEntry
    ? parseFloat(String(hashrateEntry.hashrate))
    : 0;
  // Luxor reports hashrate in H/s; hashprice is expressed as BTC/PH/s/day.
  const hashratePhs = hashrateRaw / 1e15;

  if (!(hashratePhs > 0)) {
    throw new Error(`No Luxor hashrate data available for ${dateKey}`);
  }

  const hashprice = revenue / hashratePhs;
  if (!Number.isFinite(hashprice)) {
    throw new Error(`Computed a non-finite hashprice for ${dateKey}`);
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
