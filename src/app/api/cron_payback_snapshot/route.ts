import { NextRequest, NextResponse } from "next/server";
import {
  getPreviousCompletedUtcDay,
  upsertSnapshotForDate,
} from "@/lib/services/paybackSnapshotService";

// Luxor sometimes hasn't finalized a day's hashrate/efficiency data by the
// time this cron runs shortly after UTC midnight. Re-attempting a trailing
// window (instead of only "yesterday") lets a day that failed once get
// picked up on a later run — upsertSnapshotForDate skips days that already
// have a valid snapshot, so this is safe to repeat.
const RETRY_WINDOW_DAYS = 3;

interface CronDayResult {
  date: string;
  status: "written" | "skipped" | "error";
  error?: string;
}

/**
 * GET /api/cron_payback_snapshot
 *
 * Vercel cron endpoint, protected by CRON_SECRET. Runs shortly after UTC
 * midnight and snapshots the previous completed UTC day's BTC close price,
 * Luxor hashprice, and CLIENT/COMPANY breakeven prices for both miners/OS,
 * also retrying the prior few days in case Luxor's data wasn't ready yet on
 * an earlier run. Upserts by date; never overwrites an existing valid
 * snapshot.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const latestDay = getPreviousCompletedUtcDay();
  const results: CronDayResult[] = [];

  for (let daysAgo = 0; daysAgo < RETRY_WINDOW_DAYS; daysAgo++) {
    const targetDate = new Date(latestDay);
    targetDate.setUTCDate(targetDate.getUTCDate() - daysAgo);

    try {
      const result = await upsertSnapshotForDate(targetDate);
      results.push(result);
      console.log(`[Payback Snapshot Cron] ${result.date}: ${result.status}`);
    } catch (error) {
      const dateKey = targetDate.toISOString().slice(0, 10);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to snapshot payback history";
      console.error(`[Payback Snapshot Cron] ${dateKey}: error -`, error);
      results.push({ date: dateKey, status: "error", error: message });
    }
  }

  const allErrored = results.every((r) => r.status === "error");

  return NextResponse.json(
    { success: !allErrored, results },
    { status: allErrored ? 500 : 200 },
  );
}
