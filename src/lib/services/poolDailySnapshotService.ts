import { prisma } from "@/lib/prisma";
import { createLuxorClient } from "@/lib/luxor";
import { createBraiinsClient } from "@/lib/braiins";
import {
  getPreviousCompletedUtcDay,
  toUtcDateOnly,
  formatUtcDateKey,
} from "@/lib/services/paybackSnapshotService";
import {
  withRetry,
  sleep,
  SUBACCOUNT_SPACING_MS,
  EXCLUDED_SUBACCOUNTS,
} from "@/lib/services/cronRetry";

export { getPreviousCompletedUtcDay, toUtcDateOnly, formatUtcDateKey };

interface DailySnapshotValues {
  hashrate: number | null;
  efficiency: number | null;
  uptime: number | null;
  activeWorkers: number | null;
  hashprice: number | null;
  miningRevenue: number;
  referralRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
}

const emptyValues = (): DailySnapshotValues => ({
  hashrate: null,
  efficiency: null,
  uptime: null,
  activeWorkers: null,
  hashprice: null,
  miningRevenue: 0,
  referralRevenue: 0,
  otherRevenue: 0,
  totalRevenue: 0,
});

/**
 * Keeps PoolSubaccount rows in sync with PoolAuth going forward — the
 * one-time backfill script (scripts/backfill-pool-history.js) only bootstrapped
 * subaccounts that existed at the time it ran, so any client added afterward
 * would otherwise never get a PoolSubaccount row and their daily snapshots
 * would silently never be written. Mirrors that script's bootstrap step
 * exactly, including resolving the Braiins username via the profile
 * endpoint (Braiins subaccounts are keyed by username, not by the API
 * token).
 */
export async function ensurePoolSubaccounts(): Promise<void> {
  const poolAuths = await prisma.poolAuth.findMany({
    where: { pool: { name: { in: ["Luxor", "Braiins"] } } },
    include: { pool: true },
  });

  for (const auth of poolAuths) {
    let subaccountName = auth.authKey;

    if (auth.pool.name === "Braiins") {
      try {
        const profile = await createBraiinsClient(
          auth.authKey,
          auth.userId,
        ).getUserProfile();
        subaccountName = profile.username;
      } catch (error) {
        console.error(
          `[Pool Daily Snapshot] Could not resolve Braiins username for PoolAuth ${auth.id}:`,
          error instanceof Error ? error.message : error,
        );
        continue;
      }
    }

    try {
      await prisma.poolSubaccount.upsert({
        where: {
          poolId_subaccountName: {
            poolId: auth.poolId,
            subaccountName,
          },
        },
        update: {
          userId: auth.userId,
          poolAuthId: auth.id,
          lastSyncedAt: new Date(),
        },
        create: {
          poolId: auth.poolId,
          subaccountName,
          userId: auth.userId,
          poolAuthId: auth.id,
          currency: "BTC",
          lastSyncedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(
        `[Pool Daily Snapshot] Failed to sync PoolSubaccount for PoolAuth ${auth.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

async function fetchLuxorDaySnapshot(
  authKey: string,
  dateKey: string,
): Promise<DailySnapshotValues> {
  const client = createLuxorClient(authKey);

  const [hashrateEff, revenue, uptime, activeWorkers] = await Promise.all([
    withRetry(
      () =>
        client.getHashrateEfficiency("BTC", {
          subaccount_names: authKey,
          start_date: dateKey,
          end_date: dateKey,
          tick_size: "1d",
        }),
      `${authKey} hashrate-efficiency ${dateKey}`,
    ),
    withRetry(
      () =>
        client.getRevenue("BTC", {
          subaccount_names: authKey,
          start_date: dateKey,
          end_date: dateKey,
        }),
      `${authKey} revenue ${dateKey}`,
    ),
    withRetry(
      () =>
        client.getUptime("BTC", {
          subaccount_names: authKey,
          start_date: dateKey,
          end_date: dateKey,
          tick_size: "1d",
        }),
      `${authKey} uptime ${dateKey}`,
    ),
    withRetry(
      () =>
        client.getActiveWorkers("BTC", {
          subaccount_names: authKey,
          start_date: dateKey,
          end_date: dateKey,
          tick_size: "1d",
        }),
      `${authKey} active-workers ${dateKey}`,
    ),
  ]);

  const values = emptyValues();

  const point = hashrateEff.hashrate_efficiency?.[0];
  if (point) {
    values.hashrate = parseFloat(point.hashrate || "0") || 0;
    values.efficiency =
      typeof point.efficiency === "number" ? point.efficiency * 100 : null;
  }

  const uptimePoint = uptime.uptime?.[0];
  if (uptimePoint) {
    values.uptime =
      typeof uptimePoint.uptime === "number" ? uptimePoint.uptime * 100 : null;
  }

  const workersPoint = activeWorkers.active_workers?.[0];
  if (workersPoint) {
    values.activeWorkers = workersPoint.active_workers ?? null;
  }

  for (const item of revenue.revenue || []) {
    const type = item.revenue?.revenue_type;
    const amount = item.revenue?.revenue || 0;
    if (type === "MINING") values.miningRevenue += amount;
    else if (type === "REFERRAL") values.referralRevenue += amount;
    else values.otherRevenue += amount;
    values.totalRevenue += amount;
  }

  return values;
}

async function fetchBraiinsDaySnapshot(
  authKey: string,
  dateKey: string,
): Promise<DailySnapshotValues> {
  const client = createBraiinsClient(authKey);

  const [dailyHashrate, dailyRewards] = await Promise.all([
    withRetry(
      () => client.getDailyHashrate(),
      `${authKey} daily-hashrate ${dateKey}`,
    ),
    withRetry(
      () => client.getDailyRewards({ from: dateKey, to: dateKey }),
      `${authKey} daily-rewards ${dateKey}`,
    ),
  ]);

  const values = emptyValues();

  // getDailyHashrate ignores from/to and always returns its fixed rolling
  // window (verified separately), so the matching day has to be picked out
  // of the array rather than trusted from the request params.
  const hashratePoint = (dailyHashrate.btc || []).find(
    (p) => formatUtcDateKey(new Date(p.date * 1000)) === dateKey,
  );
  if (hashratePoint) {
    values.hashrate = (Number(hashratePoint.hash_rate_24h) || 0) * 1e9; // Gh/s -> H/s
  }

  const rewardPoint = (dailyRewards.btc?.daily_rewards || []).find(
    (r) => formatUtcDateKey(new Date(r.date * 1000)) === dateKey,
  );
  if (rewardPoint) {
    const mining = parseFloat(rewardPoint.mining_reward || "0") || 0;
    const referral =
      (parseFloat(rewardPoint.referral_bonus || "0") || 0) +
      (parseFloat(rewardPoint.referral_reward || "0") || 0);
    const other = parseFloat(rewardPoint.bos_plus_reward || "0") || 0;
    const total =
      parseFloat(rewardPoint.total_reward || "0") || mining + referral + other;

    values.miningRevenue = mining;
    values.referralRevenue = referral;
    values.otherRevenue = other;
    values.totalRevenue = total;
  }

  return values;
}

export interface PoolSnapshotUpsertResult {
  poolSubaccountId: string;
  pool: string;
  subaccountName: string;
  status: "written" | "skipped" | "error";
  error?: string;
}

/**
 * Upserts every active PoolSubaccount's daily snapshot for a single UTC
 * calendar day, scoped to `poolNames`. Skips a subaccount/day that already
 * has a populated hashrate (treated as "already finalized" — mirrors
 * paybackSnapshotService's isValidSnapshot retry pattern), so this is safe
 * to call repeatedly for the same date across cron retries.
 *
 * Callers pass a single pool (["Luxor"] or ["Braiins"]) so the two pools can
 * run as separate, independently schedulable crons — Braiins currently has
 * no active miners, so its cron is deliberately left unscheduled rather than
 * writing zero-value rows every day until it's needed again.
 */
export async function upsertPoolDailySnapshotsForDate(
  dateInput: Date,
  poolNames: string[] = ["Luxor", "Braiins"],
): Promise<PoolSnapshotUpsertResult[]> {
  const dateUtc = toUtcDateOnly(dateInput);
  const dateKey = formatUtcDateKey(dateUtc);

  const subaccounts = await prisma.poolSubaccount.findMany({
    where: {
      pool: { name: { in: poolNames } },
      poolAuthId: { not: null },
      subaccountName: { notIn: [...EXCLUDED_SUBACCOUNTS] },
    },
    include: { pool: true, poolAuth: true },
  });

  const results: PoolSnapshotUpsertResult[] = [];

  for (const [index, sub] of subaccounts.entries()) {
    if (!sub.poolAuth) continue;

    if (index > 0) await sleep(SUBACCOUNT_SPACING_MS);

    const label = {
      poolSubaccountId: sub.id,
      pool: sub.pool.name,
      subaccountName: sub.subaccountName,
    };

    const existing = await prisma.poolSubaccountDailySnapshot.findUnique({
      where: {
        poolSubaccountId_date: { poolSubaccountId: sub.id, date: dateUtc },
      },
    });

    if (existing && existing.hashrate !== null) {
      results.push({ ...label, status: "skipped" });
      continue;
    }

    try {
      const values =
        sub.pool.name === "Luxor"
          ? await fetchLuxorDaySnapshot(sub.poolAuth.authKey, dateKey)
          : await fetchBraiinsDaySnapshot(sub.poolAuth.authKey, dateKey);

      // hashprice/balance are owned by the separate hashprice/balance cron
      // (see poolHashpriceBalanceService.ts) — this function never fetches
      // them, so `values.hashprice` is always null here. Excluding it from
      // `update` (but not `create`) means re-running this function for a
      // date the other cron already wrote to can't clobber it back to null.
      const { hashprice: _unusedHashprice, ...updateValues } = values;
      void _unusedHashprice;

      await prisma.poolSubaccountDailySnapshot.upsert({
        where: {
          poolSubaccountId_date: { poolSubaccountId: sub.id, date: dateUtc },
        },
        create: { poolSubaccountId: sub.id, date: dateUtc, ...values },
        update: updateValues,
      });

      results.push({ ...label, status: "written" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[Pool Daily Snapshot] ${sub.pool.name}/${sub.subaccountName} ${dateKey}: ${message}`,
      );
      results.push({ ...label, status: "error", error: message });
    }
  }

  return results;
}
