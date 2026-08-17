import { NextRequest, NextResponse } from "next/server";
import {
  ensurePoolSubaccounts,
  getPreviousCompletedUtcDay,
  upsertPoolDailySnapshotsForDate,
  PoolSnapshotUpsertResult,
} from "@/lib/services/poolDailySnapshotService";
import { sendPoolCronSummaryEmail } from "@/lib/email";

// Pool data for a given UTC day isn't always finalized by the time this runs
// shortly after midnight, so a trailing window is retried each run — same
// reasoning and pattern as cron_payback_snapshot. upsertPoolDailySnapshotsForDate
// skips a subaccount/day that already has real data, so this is safe to repeat.
const RETRY_WINDOW_DAYS = 3;

interface CronDayResult {
  date: string;
  results: PoolSnapshotUpsertResult[];
}

/**
 * GET /api/cron_pool_daily_snapshot
 *
 * Vercel cron endpoint, protected by CRON_SECRET. Runs shortly after UTC
 * midnight, syncs PoolSubaccount rows from any PoolAuth added since the last
 * run, then snapshots hashrate/efficiency/uptime/active-workers/revenue into
 * PoolSubaccountDailySnapshot for the previous few completed UTC days across
 * every Luxor subaccount.
 *
 * Luxor only — see cron_pool_daily_snapshot_braiins for Braiins, kept as a
 * separate route so it can be scheduled independently (currently dormant:
 * no active Braiins miners, so there's nothing to snapshot yet).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await ensurePoolSubaccounts();
  } catch (error) {
    console.error(
      "[Pool Daily Snapshot Cron] ensurePoolSubaccounts failed:",
      error,
    );
  }

  const latestDay = getPreviousCompletedUtcDay();
  const dayResults: CronDayResult[] = [];

  for (let daysAgo = 0; daysAgo < RETRY_WINDOW_DAYS; daysAgo++) {
    const targetDate = new Date(latestDay);
    targetDate.setUTCDate(targetDate.getUTCDate() - daysAgo);
    const dateKey = targetDate.toISOString().slice(0, 10);

    try {
      const results = await upsertPoolDailySnapshotsForDate(targetDate, [
        "Luxor",
      ]);
      dayResults.push({ date: dateKey, results });
      console.log(
        `[Pool Daily Snapshot Cron] ${dateKey}: ` +
          results
            .map((r) => `${r.pool}/${r.subaccountName}=${r.status}`)
            .join(", "),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Pool Daily Snapshot Cron] ${dateKey}: fatal -`, error);
      dayResults.push({
        date: dateKey,
        results: [
          {
            poolSubaccountId: "",
            pool: "",
            subaccountName: "",
            status: "error",
            error: message,
          },
        ],
      });
    }
  }

  const allResults = dayResults.flatMap((d) => d.results);
  const allErrored =
    allResults.length > 0 && allResults.every((r) => r.status === "error");

  try {
    await sendPoolCronSummaryEmail({
      cronName: "cron_pool_daily_snapshot",
      days: dayResults,
    });
  } catch (error) {
    // Email failure must never fail the cron itself — the DB writes above
    // already succeeded or failed independently of this.
    console.error(
      "[Pool Daily Snapshot Cron] Failed to send summary email:",
      error,
    );
  }

  return NextResponse.json(
    { success: !allErrored, days: dayResults },
    { status: allErrored ? 500 : 200 },
  );
}
