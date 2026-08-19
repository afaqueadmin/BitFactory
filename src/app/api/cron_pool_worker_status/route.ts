import { NextRequest, NextResponse } from "next/server";
import { upsertTodayWorkerStatus } from "@/lib/services/poolWorkerAndTransactionService";
import { sendPoolCronSummaryEmail } from "@/lib/email";

/**
 * GET /api/cron_pool_worker_status
 *
 * Vercel cron endpoint, protected by CRON_SECRET. Captures TODAY's live
 * worker status (firmware, stale/rejected shares, ACTIVE/INACTIVE) for
 * every worker on every Luxor subaccount — not a retry window over past
 * days like cron_pool_worker_transactions, because Luxor's worker history
 * endpoint never returns these fields at any date. Missing this run means
 * that day's worker status is gone permanently; there is no "catch up
 * tomorrow" path (same shape as cron_pool_hashprice_balance).
 *
 * Luxor only — no Braiins worker endpoint exists at all, historical or
 * current-state.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const results = await upsertTodayWorkerStatus();

  console.log(
    "[Worker Status Cron] " +
      results
        .map((r) => `${r.subaccountName}=${r.status}(${r.written})`)
        .join(", "),
  );

  const allErrored =
    results.length > 0 && results.every((r) => r.status === "error");

  try {
    await sendPoolCronSummaryEmail({
      cronName: "cron_pool_worker_status",
      days: [
        {
          date: new Date().toISOString().slice(0, 10),
          results: results.map((r) => ({
            pool: "Luxor",
            subaccountName: r.subaccountName,
            status: r.status,
            error: r.error,
          })),
        },
      ],
    });
  } catch (error) {
    console.error("[Worker Status Cron] Failed to send summary email:", error);
  }

  return NextResponse.json(
    { success: !allErrored, results },
    { status: allErrored ? 500 : 200 },
  );
}
