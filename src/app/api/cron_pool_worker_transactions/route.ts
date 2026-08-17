import { NextRequest, NextResponse } from "next/server";
import {
  getPreviousCompletedUtcDay,
  formatUtcDateKey,
  upsertWorkerDailyMetricsForRange,
  upsertTransactionsForRange,
} from "@/lib/services/poolWorkerAndTransactionService";
import { sendWorkerTransactionCronSummaryEmail } from "@/lib/email";

// Matches the sibling snapshot cron's window: both source endpoints return
// a date range in one call, so this doesn't need a day-by-day loop — just a
// wide-enough window to catch data that wasn't finalized on the day it
// happened. skipDuplicates makes re-fetching the same days on every run safe.
const RETRY_WINDOW_DAYS = 3;

/**
 * GET /api/cron_pool_worker_transactions
 *
 * Vercel cron endpoint, protected by CRON_SECRET. Upserts worker-level daily
 * hashrate/efficiency (PoolWorkerDailyMetric) and the transaction ledger
 * (PoolTransaction) for every Luxor subaccount, covering the last few
 * completed UTC days.
 *
 * Luxor only — PoolWorkerDailyMetric has no Braiins equivalent at all (no
 * such endpoint exists), and Braiins transactions are left to the dormant
 * Braiins cron for when it's reactivated.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const latestDay = getPreviousCompletedUtcDay();
  const earliestDay = new Date(latestDay);
  earliestDay.setUTCDate(earliestDay.getUTCDate() - (RETRY_WINDOW_DAYS - 1));

  const startDate = formatUtcDateKey(earliestDay);
  const endDate = formatUtcDateKey(latestDay);

  const [workerResults, transactionResults] = await Promise.all([
    upsertWorkerDailyMetricsForRange(startDate, endDate),
    upsertTransactionsForRange(startDate, endDate),
  ]);

  console.log(
    `[Worker/Transaction Cron] ${startDate} -> ${endDate}\n` +
      `  worker metrics: ${workerResults.map((r) => `${r.subaccountName}=${r.status}(${r.written})`).join(", ")}\n` +
      `  transactions: ${transactionResults.map((r) => `${r.subaccountName}=${r.status}(${r.written})`).join(", ")}`,
  );

  try {
    await sendWorkerTransactionCronSummaryEmail({
      startDate,
      endDate,
      workerResults,
      transactionResults,
    });
  } catch (error) {
    console.error(
      "[Worker/Transaction Cron] Failed to send summary email:",
      error,
    );
  }

  const allResults = [...workerResults, ...transactionResults];
  const allErrored =
    allResults.length > 0 && allResults.every((r) => r.status === "error");

  return NextResponse.json(
    {
      success: !allErrored,
      startDate,
      endDate,
      workerResults,
      transactionResults,
    },
    { status: allErrored ? 500 : 200 },
  );
}
