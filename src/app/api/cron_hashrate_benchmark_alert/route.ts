import { NextRequest, NextResponse } from "next/server";
import { checkHashrateBenchmarks } from "@/lib/services/hashrateBenchmarkAlertService";
import { sendHashrateBenchmarkAlertEmail } from "@/lib/email";

/**
 * GET /api/cron_hashrate_benchmark_alert
 *
 * Vercel cron endpoint, protected by CRON_SECRET. Standalone from every
 * other pool cron: it only reads PoolWorkerDailyMetric rows that
 * cron_pool_worker_transactions already wrote and compares them against each
 * miner's MinerHashrateBenchmark - it never calls Luxor and never touches
 * any table another cron owns. See checkHashrateBenchmarks for why it
 * re-scans a rolling window instead of only "yesterday".
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await checkHashrateBenchmarks();

    console.log(
      `[Hashrate Benchmark Alert Cron] checked ${result.checkedMiners} miner(s) over ${result.daysChecked.join(", ")}: ${result.alerts.length} below-benchmark alert(s)`,
    );

    try {
      await sendHashrateBenchmarkAlertEmail(result);
    } catch (error) {
      // Email failure must never fail the cron itself - the alert log rows
      // written by checkHashrateBenchmarks already succeeded independently.
      console.error(
        "[Hashrate Benchmark Alert Cron] Failed to send summary email:",
        error,
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Hashrate Benchmark Alert Cron] fatal -", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
