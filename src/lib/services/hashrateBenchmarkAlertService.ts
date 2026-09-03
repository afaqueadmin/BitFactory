/**
 * Miner hashrate benchmark alerting.
 *
 * Deliberately standalone from cron_pool_worker_transactions: this never
 * calls Luxor and never writes to PoolWorkerDailyMetric. It only READS the
 * daily-average hashrate that cron already fetched and persisted, and
 * compares it against each miner's configured MinerHashrateBenchmark.
 *
 * Because this runs as its own cron rather than inline after the write step,
 * it can't assume "yesterday" has already been written by the time it runs -
 * Luxor sometimes finalizes a day's data hours late (see
 * cron_pool_worker_transactions' own retry-window comments). So this re-scans
 * a rolling window on every run, same shape as that cron's RETRY_WINDOW_DAYS,
 * and relies on MinerHashrateAlertLog (unique on minerId+date) to skip a day
 * once it has already been reported - a day with no metric row yet is simply
 * skipped and picked up automatically on a later run once the write cron
 * backfills it.
 *
 * Only Luxor miners are evaluated - PoolWorkerDailyMetric has no Braiins data
 * (Braiins has no historical per-worker endpoint at all, only a live one that
 * no cron currently captures - a separate gap, out of scope here). Only
 * status "AUTO" miners are evaluated - DEPLOYMENT_IN_PROGRESS and
 * UNDER_MAINTENANCE miners are expected to not be hashing normally, so a
 * missing/low reading there is never alerted on.
 *
 * A day with no PoolWorkerDailyMetric row at all is treated as "no data yet"
 * and skipped - not a false positive. But a row that DOES exist with
 * hashrate=null and status="INACTIVE" (written by cron_pool_worker_status's
 * live capture) is a real signal for an AUTO miner: the pool saw it and
 * reported no hashing, so it counts as 0 TH/s for the comparison rather than
 * being skipped as missing data.
 */

import { prisma } from "@/lib/prisma";
import {
  getPreviousCompletedUtcDay,
  formatUtcDateKey,
} from "@/lib/services/paybackSnapshotService";

// Mirrors cron_pool_worker_transactions' own RETRY_WINDOW_DAYS - the same
// window that cron uses to backfill a late-finalizing day.
const CHECK_WINDOW_DAYS = 3;

const HS_PER_THS = 1_000_000_000_000;

export interface HashrateBenchmarkAlert {
  minerId: string;
  minerName: string;
  customerName: string | null;
  date: string;
  actualHashrateThs: number;
  benchmarkHashrateThs: number;
  shortfallPct: number;
}

export interface HashrateBenchmarkCheckResult {
  checkedMiners: number;
  daysChecked: string[];
  alerts: HashrateBenchmarkAlert[];
}

export async function checkHashrateBenchmarks(
  now: Date = new Date(),
): Promise<HashrateBenchmarkCheckResult> {
  const latestDay = getPreviousCompletedUtcDay(now);
  const days: Date[] = [];
  for (let daysAgo = 0; daysAgo < CHECK_WINDOW_DAYS; daysAgo++) {
    const day = new Date(latestDay);
    day.setUTCDate(day.getUTCDate() - daysAgo);
    days.push(day);
  }

  const miners = await prisma.miner.findMany({
    where: {
      isDeleted: false,
      status: "AUTO",
      pool: { name: "Luxor" },
      hashrateBenchmarks: { some: {} },
    },
    select: {
      id: true,
      name: true,
      userId: true,
      user: { select: { name: true, companyName: true } },
      hashrateBenchmarks: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { benchmarkHashrate: true },
      },
    },
  });

  const daysChecked = days.map(formatUtcDateKey);
  if (miners.length === 0) {
    return { checkedMiners: 0, daysChecked, alerts: [] };
  }

  const userIds = Array.from(new Set(miners.map((m) => m.userId)));
  const poolSubaccounts = await prisma.poolSubaccount.findMany({
    where: { userId: { in: userIds }, pool: { name: "Luxor" } },
    select: { id: true, userId: true },
  });
  const subaccountIdByUserId = new Map(
    poolSubaccounts.map((s) => [s.userId, s.id]),
  );
  const relevantSubaccountIds = Array.from(
    new Set(Array.from(subaccountIdByUserId.values())),
  );

  const alerts: HashrateBenchmarkAlert[] = [];

  for (const day of days) {
    if (relevantSubaccountIds.length === 0) continue;

    const [metrics, alreadyLogged] = await Promise.all([
      prisma.poolWorkerDailyMetric.findMany({
        where: {
          poolSubaccountId: { in: relevantSubaccountIds },
          date: day,
        },
        select: {
          poolSubaccountId: true,
          workerName: true,
          hashrate: true,
          status: true,
        },
      }),
      prisma.minerHashrateAlertLog.findMany({
        where: { date: day, minerId: { in: miners.map((m) => m.id) } },
        select: { minerId: true },
      }),
    ]);

    const metricByKey = new Map(
      metrics.map((m) => [`${m.poolSubaccountId}::${m.workerName}`, m]),
    );
    const alreadyLoggedIds = new Set(alreadyLogged.map((a) => a.minerId));

    const newlyLogged: {
      minerId: string;
      date: Date;
      actualHashrate: number;
      benchmarkHashrate: number;
    }[] = [];

    for (const miner of miners) {
      if (alreadyLoggedIds.has(miner.id)) continue;

      const subaccountId = subaccountIdByUserId.get(miner.userId);
      if (!subaccountId) continue; // owner has no Luxor subaccount - can't evaluate

      const metric = metricByKey.get(`${subaccountId}::${miner.name}`);
      if (!metric) continue; // no row at all for this day (yet) - not a false positive

      let actualThs: number;
      if (metric.hashrate != null) {
        actualThs = Number(metric.hashrate) / HS_PER_THS;
      } else if (metric.status === "INACTIVE") {
        // AUTO miner, pool confirmed no hashing that day - real 0, not missing data.
        actualThs = 0;
      } else {
        continue; // null hashrate with no INACTIVE confirmation - ambiguous, wait for real data
      }

      const benchmarkThs = Number(
        miner.hashrateBenchmarks[0].benchmarkHashrate,
      );
      if (actualThs >= benchmarkThs) continue;

      alerts.push({
        minerId: miner.id,
        minerName: miner.name,
        customerName: miner.user.name || miner.user.companyName || null,
        date: formatUtcDateKey(day),
        actualHashrateThs: actualThs,
        benchmarkHashrateThs: benchmarkThs,
        shortfallPct: ((benchmarkThs - actualThs) / benchmarkThs) * 100,
      });

      newlyLogged.push({
        minerId: miner.id,
        date: day,
        actualHashrate: actualThs,
        benchmarkHashrate: benchmarkThs,
      });
    }

    if (newlyLogged.length > 0) {
      await prisma.minerHashrateAlertLog.createMany({
        data: newlyLogged,
        skipDuplicates: true,
      });
    }
  }

  return { checkedMiners: miners.length, daysChecked, alerts };
}
