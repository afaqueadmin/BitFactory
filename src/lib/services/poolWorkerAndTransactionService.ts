/**
 * Worker-level daily metrics + transaction ledger — the two tables the main
 * subaccount snapshot cron doesn't touch (flagged gaps #3/#4).
 *
 * Both source endpoints return a whole date RANGE in one call (unlike the
 * subaccount snapshot endpoints, which needed a call per day), so this
 * fetches the retry window in a single request per subaccount and relies on
 * `skipDuplicates` for idempotency, rather than the per-day upsert-and-skip
 * pattern poolDailySnapshotService.ts uses.
 *
 * Luxor only, matching the sibling crons' split: PoolWorkerDailyMetric has
 * no Braiins equivalent at all (no such endpoint exists, permanently), and
 * Braiins transactions are left to the dormant Braiins cron for when it's
 * reactivated.
 */

import { prisma } from "@/lib/prisma";
import { createLuxorClient } from "@/lib/luxor";
import {
  toUtcDateOnly,
  formatUtcDateKey,
  getPreviousCompletedUtcDay,
} from "@/lib/services/paybackSnapshotService";
import type { Worker } from "@/lib/luxor";
import {
  withRetry,
  sleep,
  SUBACCOUNT_SPACING_MS,
  EXCLUDED_SUBACCOUNTS,
} from "@/lib/services/cronRetry";

export { toUtcDateOnly, formatUtcDateKey, getPreviousCompletedUtcDay };

const parseUtcDate = (dateKey: string): Date =>
  new Date(`${dateKey}T00:00:00.000Z`);

interface WorkerHashrateEfficiencyResponse {
  hashrate_efficiency_revenue?: Record<
    string,
    Array<{
      date_time: string;
      hashrate: string;
      efficiency: number;
      est_revenue?: number;
    }>
  >;
  pagination?: { item_count?: number };
}

export interface RangeResult {
  subaccountName: string;
  status: "written" | "error";
  fetched: number;
  written: number;
  error?: string;
}

/**
 * Upserts worker-level hashrate/efficiency/est_revenue for every Luxor
 * subaccount over [startDate, endDate] (inclusive, YYYY-MM-DD strings).
 */
export async function upsertWorkerDailyMetricsForRange(
  startDate: string,
  endDate: string,
): Promise<RangeResult[]> {
  const subaccounts = await prisma.poolSubaccount.findMany({
    where: {
      pool: { name: "Luxor" },
      poolAuthId: { not: null },
      subaccountName: { notIn: [...EXCLUDED_SUBACCOUNTS] },
    },
    include: { poolAuth: true },
  });

  const results: RangeResult[] = [];

  for (const [index, sub] of subaccounts.entries()) {
    if (!sub.poolAuth) continue;

    if (index > 0) await sleep(SUBACCOUNT_SPACING_MS);

    try {
      const client = createLuxorClient(sub.poolAuth.authKey);
      let pageNumber = 1;
      let hasMore = true;
      const records: Array<{
        poolSubaccountId: string;
        workerName: string;
        date: Date;
        hashrate: number;
        efficiency: number | null;
        estRevenue: number | null;
      }> = [];

      while (hasMore) {
        const page = (await withRetry(
          () =>
            client.getWorkersHashrateEfficiency("BTC", sub.poolAuth!.authKey, {
              tick_size: "1d",
              start_date: startDate,
              end_date: endDate,
              page_number: pageNumber,
              page_size: 100,
            }),
          `${sub.subaccountName} workers-hashrate-efficiency p${pageNumber}`,
        )) as WorkerHashrateEfficiencyResponse;

        const byWorker = page.hashrate_efficiency_revenue || {};
        for (const [workerName, points] of Object.entries(byWorker)) {
          for (const p of points) {
            records.push({
              poolSubaccountId: sub.id,
              workerName,
              date: parseUtcDate(p.date_time.slice(0, 10)),
              hashrate: parseFloat(p.hashrate || "0") || 0,
              efficiency:
                typeof p.efficiency === "number" ? p.efficiency * 100 : null,
              estRevenue:
                typeof p.est_revenue === "number" ? p.est_revenue : null,
            });
          }
        }

        const totalWorkers =
          page.pagination?.item_count ?? Object.keys(byWorker).length;
        hasMore = pageNumber * 100 < totalWorkers;
        pageNumber++;
        if (pageNumber > 20) break;
      }

      // Per-row upsert, not createMany+skipDuplicates: cron_pool_worker_status
      // (see upsertTodayWorkerStatus below) can create today's row first with
      // only firmware/staleShares/rejectedShares/status set. skipDuplicates
      // would then silently refuse to ever fill in this row's hashrate once
      // that happens, since the row already "exists". Excluding those four
      // fields from `update` (but not `create`) is the same clobber-prevention
      // pattern poolDailySnapshotService.ts uses for hashprice/balance, just
      // in the other direction.
      if (records.length) {
        await prisma.$transaction(
          records.map((r) =>
            prisma.poolWorkerDailyMetric.upsert({
              where: {
                poolSubaccountId_workerName_date: {
                  poolSubaccountId: r.poolSubaccountId,
                  workerName: r.workerName,
                  date: r.date,
                },
              },
              create: r,
              update: {
                hashrate: r.hashrate,
                efficiency: r.efficiency,
                estRevenue: r.estRevenue,
              },
            }),
          ),
        );
      }

      results.push({
        subaccountName: sub.subaccountName,
        status: "written",
        fetched: records.length,
        written: records.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[Worker Metrics] ${sub.subaccountName} ${startDate}->${endDate}: ${message}`,
      );
      results.push({
        subaccountName: sub.subaccountName,
        status: "error",
        fetched: 0,
        written: 0,
        error: message,
      });
    }
  }

  return results;
}

interface LuxorTransactionsResponse {
  transactions: Array<{
    transaction_id: string;
    transaction_category: string;
    transaction_type: string;
    currency_amount: number;
    usd_equivalent: number;
    address_name: string;
    date_time: string;
  }>;
  pagination?: { next_page_url: string | null };
}

const CREDIT_CATEGORIES = new Set(["Miner Revenue", "LuxOS Rebate"]);

/**
 * Upserts the Luxor transaction ledger for every Luxor subaccount over
 * [startDate, endDate] (inclusive, YYYY-MM-DD strings).
 */
export async function upsertTransactionsForRange(
  startDate: string,
  endDate: string,
): Promise<RangeResult[]> {
  const subaccounts = await prisma.poolSubaccount.findMany({
    where: {
      pool: { name: "Luxor" },
      poolAuthId: { not: null },
      subaccountName: { notIn: [...EXCLUDED_SUBACCOUNTS] },
    },
    include: { poolAuth: true },
  });

  const results: RangeResult[] = [];

  for (const [index, sub] of subaccounts.entries()) {
    if (!sub.poolAuth) continue;

    if (index > 0) await sleep(SUBACCOUNT_SPACING_MS);

    try {
      const client = createLuxorClient(sub.poolAuth.authKey);
      let pageNumber = 1;
      let hasMore = true;
      const records: Array<{
        poolId: string;
        poolSubaccountId: string;
        externalTransactionId: string | null;
        transactionType: string;
        category: string;
        amount: number;
        usdEquivalent: number;
        addressName: string | null;
        occurredAt: Date;
      }> = [];

      while (hasMore) {
        const page = (await withRetry(
          () =>
            client.getTransactions("BTC", {
              subaccount_names: sub.poolAuth!.authKey,
              start_date: startDate,
              end_date: endDate,
              page_number: pageNumber,
              page_size: 250,
            }),
          `${sub.subaccountName} transactions p${pageNumber}`,
        )) as unknown as LuxorTransactionsResponse;

        for (const tx of page.transactions || []) {
          records.push({
            poolId: sub.poolId,
            poolSubaccountId: sub.id,
            externalTransactionId: tx.transaction_id || null,
            transactionType: CREDIT_CATEGORIES.has(tx.transaction_category)
              ? "credit"
              : tx.transaction_type,
            category: tx.transaction_category,
            amount: tx.currency_amount,
            usdEquivalent: tx.usd_equivalent,
            addressName: tx.address_name || null,
            occurredAt: new Date(tx.date_time),
          });
        }

        hasMore = page.pagination?.next_page_url != null;
        pageNumber++;
        if (pageNumber > 20) break;
      }

      let written = 0;
      if (records.length) {
        const result = await prisma.poolTransaction.createMany({
          data: records,
          skipDuplicates: true,
        });
        written = result.count;
      }

      results.push({
        subaccountName: sub.subaccountName,
        status: "written",
        fetched: records.length,
        written,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[Transactions] ${sub.subaccountName} ${startDate}->${endDate}: ${message}`,
      );
      results.push({
        subaccountName: sub.subaccountName,
        status: "error",
        fetched: 0,
        written: 0,
        error: message,
      });
    }
  }

  return results;
}

/**
 * Captures today's live worker status — firmware, stale/rejected shares,
 * ACTIVE/INACTIVE — for every Luxor subaccount.
 *
 * GET /pool/workers/:currency has no historical equivalent at all (verified
 * live 2026-08-19: the only fields the history endpoint returns are
 * date_time/hashrate/efficiency/est_revenue — no firmware, stale/rejected
 * shares, or status, ever). Same "capture today or lose it forever" shape
 * as poolHashpriceBalanceService.ts, just per-worker instead of
 * per-subaccount, and writing into PoolWorkerDailyMetric instead of
 * PoolSubaccountDailySnapshot.
 *
 * Only touches firmware/staleShares/rejectedShares/status on `update` —
 * never hashrate/efficiency/estRevenue, which belong to
 * upsertWorkerDailyMetricsForRange above. Whichever of the two crons
 * reaches a given (subaccount, worker, today) row first creates it; the
 * other only ever updates its own fields.
 */
export async function upsertTodayWorkerStatus(
  now: Date = new Date(),
): Promise<RangeResult[]> {
  const today = toUtcDateOnly(now);
  const dateKey = formatUtcDateKey(today);

  const subaccounts = await prisma.poolSubaccount.findMany({
    where: {
      pool: { name: "Luxor" },
      poolAuthId: { not: null },
      subaccountName: { notIn: [...EXCLUDED_SUBACCOUNTS] },
    },
    include: { poolAuth: true },
  });

  const results: RangeResult[] = [];

  for (const [index, sub] of subaccounts.entries()) {
    if (!sub.poolAuth) continue;

    if (index > 0) await sleep(SUBACCOUNT_SPACING_MS);

    try {
      const client = createLuxorClient(sub.poolAuth.authKey);
      let pageNumber = 1;
      let hasMore = true;
      const workers: Worker[] = [];

      while (hasMore) {
        const page = await withRetry(
          () =>
            client.getWorkers("BTC", {
              subaccount_names: sub.poolAuth!.authKey,
              page_number: pageNumber,
              page_size: 100,
            }),
          `${sub.subaccountName} workers p${pageNumber}`,
        );

        workers.push(...(page.workers || []));

        hasMore = page.pagination?.next_page_url != null;
        pageNumber++;
        if (pageNumber > 20) break;
      }

      if (workers.length) {
        await prisma.$transaction(
          workers.map((w) =>
            prisma.poolWorkerDailyMetric.upsert({
              where: {
                poolSubaccountId_workerName_date: {
                  poolSubaccountId: sub.id,
                  workerName: w.name,
                  date: today,
                },
              },
              create: {
                poolSubaccountId: sub.id,
                workerName: w.name,
                date: today,
                firmware: w.firmware ?? null,
                staleShares: w.stale_shares ?? null,
                rejectedShares: w.rejected_shares ?? null,
                status: w.status ?? null,
              },
              update: {
                firmware: w.firmware ?? null,
                staleShares: w.stale_shares ?? null,
                rejectedShares: w.rejected_shares ?? null,
                status: w.status ?? null,
              },
            }),
          ),
        );
      }

      results.push({
        subaccountName: sub.subaccountName,
        status: "written",
        fetched: workers.length,
        written: workers.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[Worker Status] ${sub.subaccountName} ${dateKey}: ${message}`,
      );
      results.push({
        subaccountName: sub.subaccountName,
        status: "error",
        fetched: 0,
        written: 0,
        error: message,
      });
    }
  }

  return results;
}
