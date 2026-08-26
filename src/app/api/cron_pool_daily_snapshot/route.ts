import { NextRequest, NextResponse } from "next/server";
import {
  getPreviousCompletedUtcDay,
  upsertPoolDailySnapshotsForDate,
  PoolSnapshotUpsertResult,
} from "@/lib/services/poolDailySnapshotService";
import { sendPoolCronSummaryEmail } from "@/lib/email";

// Scheduled for 06:00 UTC, not right at midnight — moved back repeatedly
// based on live evidence of how late Luxor finalizes the just-ended day:
//   2026-08-20: still empty at 00:21 UTC (~20 min after midnight)
//   2026-08-23: still empty at 02:01 UTC (~2h after midnight) for ALL 17
//     subaccounts — the 2-hour buffer wasn't enough either.
//   2026-08-26: still empty at 05:01 UTC (~5h after midnight) for ALL 17
//     subaccounts — the 5-hour buffer wasn't enough either.
// Even with this buffer, pool data isn't always finalized by the time this
// runs, so a trailing window is retried each run on top of it — same
// reasoning and pattern as cron_payback_snapshot.
// upsertPoolDailySnapshotsForDate skips a subaccount/day that already has
// real data, so this is safe to repeat.
const RETRY_WINDOW_DAYS = 3;

interface CronDayResult {
  date: string;
  results: PoolSnapshotUpsertResult[];
}

/**
 * GET /api/cron_pool_daily_snapshot
 *
 * Vercel cron endpoint, protected by CRON_SECRET. Runs at 06:00 UTC (see
 * note above on why not closer to midnight), snapshots
 * hashrate/efficiency/uptime/active-workers/revenue into
 * PoolSubaccountDailySnapshot for the previous few completed UTC days across
 * every Luxor subaccount.
 *
 * Does not call ensurePoolSubaccounts() — that now runs in
 * cron_pool_worker_status (23:35 UTC, the earliest cron in the daily cycle),
 * so every cron that runs after it, across all pool crons, sees a
 * same-day-added customer instead of just this one.
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

  const latestDay = getPreviousCompletedUtcDay();
  const dayResults: CronDayResult[] = [];

  for (let daysAgo = 0; daysAgo < RETRY_WINDOW_DAYS; daysAgo++) {
    const targetDate = new Date(latestDay);
    targetDate.setUTCDate(targetDate.getUTCDate() - daysAgo);
    const dateKey = targetDate.toISOString().slice(0, 10);

    try {
      const rawResults = await upsertPoolDailySnapshotsForDate(targetDate, [
        "Luxor",
      ]);

      // Enrich "pending" (fetched OK, pool hadn't finalized this day yet)
      // with exactly when it'll be retried — the service function knows
      // WHY a date is pending, but only this route knows the schedule and
      // where we are in the retry window, so it owns the WHEN.
      const attemptsRemaining = RETRY_WINDOW_DAYS - daysAgo - 1;
      const retryNote =
        attemptsRemaining > 0
          ? `Will retry automatically on tomorrow's run (06:00 UTC) — ${attemptsRemaining} more attempt${attemptsRemaining === 1 ? "" : "s"} left after that before this date drops out of the 3-day retry window.`
          : `This was the last automatic retry for this date (3-day retry window now exhausted) — if it's still empty after this, it needs a manual backfill, it will not be retried again on its own.`;

      const results: PoolSnapshotUpsertResult[] = rawResults.map((r) =>
        r.status === "pending"
          ? { ...r, note: `${r.note ?? ""} ${retryNote}`.trim() }
          : r,
      );

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
