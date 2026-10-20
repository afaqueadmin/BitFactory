/**
 * Reads the simulated miner's real data for the simulation. Read-only: nothing
 * here writes to the database.
 */

import { prisma } from "@/lib/prisma";
import { poolDataCache } from "@/lib/cache";
import { createLuxorClient, type Worker } from "@/lib/luxor";
import { joinSubaccountNames } from "@/lib/luxorSubaccounts";
import { fetchLiveBtcKlines } from "@/lib/services/btcPriceService";
import { simDailyChargeUsd, type SimContext } from "./context";
import { SIM_SUBACCOUNT_NAME } from "./config";
import { addDays, dayKey, dayKeysBetween, utcDayStart } from "./dates";
import {
  DEFAULT_PAYOUT_CATEGORIES,
  simPoolLedger,
  type SimDay,
  type SimPoolLedger,
} from "./payouts";
import { SHARE_LOOKBACK_DAYS, simShareDays } from "./share";

/**
 * The simulated miner's completed days since registration: its share of the
 * owner subaccount's real Miner Revenue credit each day (see ./share), from
 * PoolWorkerDailyMetric (cron_pool_worker_transactions) and
 * PoolSubaccountDailySnapshot (cron_pool_daily_snapshot).
 */
export async function loadSimDays(ctx: SimContext): Promise<SimDay[]> {
  if (ctx.ownerSubaccounts.length === 0) return [];
  const subaccountIds = ctx.ownerSubaccounts.map((s) => s.poolSubaccountId);
  const today = utcDayStart(ctx.now);
  const firstDay = utcDayStart(ctx.since);
  if (firstDay >= today) return [];
  // Earlier days too, so a day with missing worker metrics can borrow the
  // most recent share.
  const lookbackFrom = addDays(firstDay, -SHARE_LOOKBACK_DAYS);

  const [worker, totals, credits] = await Promise.all([
    prisma.poolWorkerDailyMetric.findMany({
      where: {
        poolSubaccountId: { in: subaccountIds },
        workerName: ctx.demoMiner.workerName,
        date: { gte: lookbackFrom, lt: today },
      },
      select: {
        poolSubaccountId: true,
        date: true,
        hashrate: true,
        estRevenue: true,
      },
    }),
    prisma.poolWorkerDailyMetric.groupBy({
      by: ["poolSubaccountId", "date"],
      where: {
        poolSubaccountId: { in: subaccountIds },
        date: { gte: lookbackFrom, lt: today },
      },
      _sum: { estRevenue: true },
    }),
    prisma.poolSubaccountDailySnapshot.findMany({
      where: {
        poolSubaccountId: { in: subaccountIds },
        date: { gte: firstDay, lt: today },
      },
      select: { poolSubaccountId: true, date: true, miningRevenue: true },
    }),
  ]);

  return simShareDays({
    days: dayKeysBetween(firstDay, addDays(today, -1)),
    worker: worker.map((w) => ({
      subaccountId: w.poolSubaccountId,
      date: dayKey(w.date),
      estRevenue: w.estRevenue !== null ? Number(w.estRevenue) : 0,
      hashrate: w.hashrate !== null ? Number(w.hashrate) : 0,
    })),
    totals: totals.map((t) => ({
      subaccountId: t.poolSubaccountId,
      date: dayKey(t.date),
      estRevenue: t._sum.estRevenue !== null ? Number(t._sum.estRevenue) : 0,
    })),
    credits: credits.map((c) => ({
      subaccountId: c.poolSubaccountId,
      date: dayKey(c.date),
      miningRevenue: Number(c.miningRevenue),
    })),
  });
}

/**
 * The daily charge right now - the "Daily cost" card and the days-left
 * projection. Like a real miner, nothing while the miner isn't AUTO.
 */
export function simDailyCost(ctx: SimContext): number {
  return ctx.demoMiner.status === "AUTO"
    ? simDailyChargeUsd(ctx.demoMiner, ctx.ratePerKwh)
    : 0;
}

const KLINE_CACHE_KEY = "sim_btc_daily_closes";

/** BTC daily closes from Binance, keyed by day (cached for an hour). */
async function dailyCloses(): Promise<Map<string, number>> {
  const cached = poolDataCache.get(KLINE_CACHE_KEY) as Array<
    [string, number]
  > | null;
  if (cached) return new Map(cached);
  try {
    const klines = (await fetchLiveBtcKlines("1d", 1000)) as unknown[][];
    const entries: Array<[string, number]> = klines.map((k) => [
      dayKey(new Date(Number(k[0]))),
      parseFloat(String(k[4])),
    ]);
    poolDataCache.set(KLINE_CACHE_KEY, entries, 3600);
    return new Map(entries);
  } catch (error) {
    console.error("[Simulation] BTC daily closes unavailable:", error);
    return new Map();
  }
}

/**
 * The BTC price Luxor used for each day: usdEquivalent / amount of the
 * owner subaccounts' own revenue credits, falling back to Binance closes.
 */
async function loadPriceByDay(
  ctx: SimContext,
  dayKeys: string[],
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (dayKeys.length === 0) return prices;

  if (ctx.ownerSubaccounts.length > 0) {
    const credits = await prisma.poolTransaction.findMany({
      where: {
        poolSubaccountId: {
          in: ctx.ownerSubaccounts.map((s) => s.poolSubaccountId),
        },
        transactionType: "credit",
        category: DEFAULT_PAYOUT_CATEGORIES.credit,
        occurredAt: {
          gte: utcDayStart(new Date(`${dayKeys[0]}T00:00:00.000Z`)),
        },
        usdEquivalent: { not: null },
      },
      select: { occurredAt: true, amount: true, usdEquivalent: true },
    });
    for (const c of credits) {
      const amount = Number(c.amount);
      const usd = Number(c.usdEquivalent);
      if (amount > 0 && usd > 0) prices.set(dayKey(c.occurredAt), usd / amount);
    }
  }

  if (dayKeys.some((k) => !prices.has(k))) {
    const closes = await dailyCloses();
    for (const k of dayKeys) {
      if (!prices.has(k) && closes.has(k)) prices.set(k, closes.get(k)!);
    }
  }
  return prices;
}

/** The owner's most recent real payout fee (BTC), or 0. */
async function loadPayoutFee(ctx: SimContext): Promise<number> {
  if (ctx.ownerSubaccounts.length === 0) return 0;
  const fee = await prisma.poolTransaction.findFirst({
    where: {
      poolSubaccountId: {
        in: ctx.ownerSubaccounts.map((s) => s.poolSubaccountId),
      },
      category: DEFAULT_PAYOUT_CATEGORIES.fee,
    },
    orderBy: { occurredAt: "desc" },
    select: { amount: true },
  });
  return fee ? Math.abs(Number(fee.amount)) : 0;
}

export async function loadSimPoolLedger(
  ctx: SimContext,
  days?: SimDay[],
): Promise<SimPoolLedger> {
  const simDays = days ?? (await loadSimDays(ctx));
  // Every day a row can be dated: credits back to registration, and payout
  // dates up to today.
  const keys = dayKeysBetween(ctx.since, ctx.now);
  const [priceByDay, feeBtc] = await Promise.all([
    loadPriceByDay(ctx, keys),
    loadPayoutFee(ctx),
  ]);
  return simPoolLedger({ days: simDays, now: ctx.now, feeBtc, priceByDay });
}

export interface SimLiveWorker {
  status: "ACTIVE" | "INACTIVE";
  hashrate: number;
  efficiency: number;
  firmware: string;
  staleShares: number;
  rejectedShares: number;
  lastShareTime: string | null;
}

/**
 * The simulated worker as Luxor reports it right now. Shared by every simulated
 * account, so it's cached for a minute to stay clear of Luxor's rate limit.
 */
export async function loadSimLiveWorker(
  ctx: SimContext,
): Promise<SimLiveWorker | null> {
  if (ctx.ownerSubaccounts.length === 0) return null;
  const cacheKey = `sim_live_worker_${ctx.demoMiner.id}`;
  const cached = poolDataCache.get(cacheKey) as SimLiveWorker | null;
  if (cached) return cached;

  const names = joinSubaccountNames(
    ctx.ownerSubaccounts.map((s) => s.subaccountName),
  );
  const client = createLuxorClient(names);
  const response = await client.getWorkers("BTC", {
    subaccount_names: names,
    page_size: 1000,
  });

  // A miner moved between subaccounts leaves a stale INACTIVE twin behind;
  // prefer the ACTIVE entry.
  const target = ctx.demoMiner.workerName.trim().toLowerCase();
  const matches = (response.workers || []).filter(
    (w: Worker) => w.name.trim().toLowerCase() === target,
  );
  const worker = matches.find((w) => w.status === "ACTIVE") ?? matches[0];
  if (!worker) return null;

  const live: SimLiveWorker = {
    status: worker.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
    hashrate: Number(worker.hashrate) || 0,
    efficiency: Number(worker.efficiency) || 0,
    firmware: worker.firmware || "",
    staleShares: Number(worker.stale_shares) || 0,
    rejectedShares: Number(worker.rejected_shares) || 0,
    lastShareTime: worker.last_share_time || null,
  };
  poolDataCache.set(cacheKey, live, 60);
  return live;
}

export interface SimPoolSummary {
  hashprice: number;
  efficiency_5m: number;
  uptime_24h: number;
}

/**
 * Pool-level figures with no per-worker equivalent (hashprice, uptime) and
 * efficiency in the units /api/miners/summary already reports, from the
 * owner subaccounts' Luxor summary. Cached for a minute, shared by all.
 */
export async function loadSimPoolSummary(
  ctx: SimContext,
): Promise<SimPoolSummary | null> {
  if (ctx.ownerSubaccounts.length === 0) return null;
  const cacheKey = `sim_pool_summary_${ctx.demoMiner.id}`;
  const cached = poolDataCache.get(cacheKey) as SimPoolSummary | null;
  if (cached) return cached;

  const names = joinSubaccountNames(
    ctx.ownerSubaccounts.map((s) => s.subaccountName),
  );
  const summary = await createLuxorClient(names).getSummary("BTC", {
    subaccount_names: names,
  });
  const result: SimPoolSummary = {
    hashprice: summary.hashprice?.[0]?.value
      ? Number(summary.hashprice[0].value)
      : 0,
    efficiency_5m: summary.efficiency_5m || 0,
    uptime_24h: summary.uptime_24h || 0,
  };
  poolDataCache.set(cacheKey, result, 60);
  return result;
}

/** The live worker in Luxor's own Worker shape, renamed for display. */
export function simWorkerForDisplay(
  ctx: SimContext,
  live: SimLiveWorker,
): Worker {
  return {
    currency_type: "BTC",
    id: ctx.demoMiner.id,
    subaccount_name: SIM_SUBACCOUNT_NAME,
    name: ctx.displayName,
    firmware: live.firmware,
    hashrate: live.hashrate,
    efficiency: live.efficiency,
    stale_shares: live.staleShares,
    rejected_shares: live.rejectedShares,
    last_share_time: live.lastShareTime ?? "",
    status: live.status,
  };
}
