/**
 * Reads the demo miner's real data for the simulation. Read-only: nothing
 * here writes to the database.
 */

import { prisma } from "@/lib/prisma";
import { poolDataCache } from "@/lib/cache";
import { createLuxorClient, type Worker } from "@/lib/luxor";
import { joinSubaccountNames } from "@/lib/luxorSubaccounts";
import { fetchLiveBtcKlines } from "@/lib/services/btcPriceService";
import type { SimContext } from "./context";
import { SIM_SUBACCOUNT_NAME, simBonusUsd } from "./config";
import { dayKey, dayKeysBetween, utcDayStart } from "./dates";
import { simCostLedger, type SimLedgerRow } from "./ledger";
import {
  DEFAULT_PAYOUT_CATEGORIES,
  simPoolLedger,
  type SimDay,
  type SimPoolLedger,
} from "./payouts";

/**
 * The demo worker's completed days since registration: daily hashrate and
 * Luxor's per-worker est. revenue (PoolWorkerDailyMetric, written by
 * cron_pool_worker_transactions). A miner only hashes in one subaccount at a
 * time, so rows from several subaccounts are summed per day.
 */
export async function loadSimDays(ctx: SimContext): Promise<SimDay[]> {
  if (ctx.ownerSubaccounts.length === 0) return [];
  const today = utcDayStart(ctx.now);

  const rows = await prisma.poolWorkerDailyMetric.findMany({
    where: {
      poolSubaccountId: {
        in: ctx.ownerSubaccounts.map((s) => s.poolSubaccountId),
      },
      workerName: ctx.demoMiner.workerName,
      date: { gte: utcDayStart(ctx.since), lt: today },
    },
    select: { date: true, hashrate: true, estRevenue: true },
  });

  const byDay = new Map<string, SimDay>();
  for (const r of rows) {
    const key = dayKey(r.date);
    const day = byDay.get(key) ?? { date: key, hashrate: 0, btc: 0 };
    day.hashrate += r.hashrate !== null ? Number(r.hashrate) : 0;
    day.btc += r.estRevenue !== null ? Number(r.estRevenue) : 0;
    byDay.set(key, day);
  }
  return Array.from(byDay.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export function simLedgerFromDays(
  ctx: SimContext,
  days: SimDay[],
): SimLedgerRow[] {
  return simCostLedger({
    since: ctx.since,
    now: ctx.now,
    bonusUsd: simBonusUsd(),
    powerUsageKw: ctx.demoMiner.hardware.powerUsage,
    rates: ctx.demoMiner.rates,
    hashrateByDay: new Map(days.map((d) => [d.date, d.hashrate])),
  });
}

export async function loadSimLedger(ctx: SimContext): Promise<SimLedgerRow[]> {
  return simLedgerFromDays(ctx, await loadSimDays(ctx));
}

/** Today's daily charge at the latest rate - the "days left" projection. */
export function simDailyCost(ctx: SimContext): number {
  const rates = ctx.demoMiner.rates;
  const latest = rates.length ? rates[rates.length - 1].ratePerKwh : 0;
  return ctx.demoMiner.hardware.powerUsage * latest * 24;
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
 * The demo worker as Luxor reports it right now. Shared by every demo
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
