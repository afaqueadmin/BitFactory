import { NextRequest, NextResponse } from "next/server";
import {
  getPreviousCompletedUtcDay,
  upsertPoolDailySnapshotsForDate,
  PoolSnapshotUpsertResult,
} from "@/lib/services/poolDailySnapshotService";
import { sendPoolCronSummaryEmail } from "@/lib/email";

// Same retry reasoning as cron_pool_daily_snapshot.
const RETRY_WINDOW_DAYS = 3;

interface CronDayResult {
  date: string;
  results: PoolSnapshotUpsertResult[];
}

/**
 * GET /api/cron_pool_daily_snapshot_braiins
 *
 * Braiins counterpart to cron_pool_daily_snapshot, kept as its own route
 * (not registered in vercel.json) so it can sit dormant without writing
 * anything: there are currently no active Braiins miners, so a daily run
 * would just produce zero-value rows. Activate later by adding a schedule
 * entry for this path in vercel.json — no code changes needed.
 *
 * Does not call ensurePoolSubaccounts() — the Luxor cron already keeps
 * PoolSubaccount rows in sync for both pools regardless of which
 * snapshot cron is scheduled.
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
        "Braiins",
      ]);

      const attemptsRemaining = RETRY_WINDOW_DAYS - daysAgo - 1;
      const retryNote =
        attemptsRemaining > 0
          ? `Will retry automatically on this cron's next run (once activated in vercel.json) — ${attemptsRemaining} more attempt${attemptsRemaining === 1 ? "" : "s"} left after that before this date drops out of the 3-day retry window.`
          : `This was the last automatic retry for this date (3-day retry window now exhausted) — if it's still empty after this, it needs a manual backfill, it will not be retried again on its own.`;

      const results: PoolSnapshotUpsertResult[] = rawResults.map((r) =>
        r.status === "pending"
          ? { ...r, note: `${r.note ?? ""} ${retryNote}`.trim() }
          : r,
      );

      dayResults.push({ date: dateKey, results });
      console.log(
        `[Pool Daily Snapshot Cron - Braiins] ${dateKey}: ` +
          results
            .map((r) => `${r.pool}/${r.subaccountName}=${r.status}`)
            .join(", "),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[Pool Daily Snapshot Cron - Braiins] ${dateKey}: fatal -`,
        error,
      );
      dayResults.push({
        date: dateKey,
        results: [
          {
            poolSubaccountId: "",
            pool: "Braiins",
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
      cronName: "cron_pool_daily_snapshot_braiins",
      days: dayResults,
    });
  } catch (error) {
    console.error(
      "[Pool Daily Snapshot Cron - Braiins] Failed to send summary email:",
      error,
    );
  }

  return NextResponse.json(
    { success: !allErrored, days: dayResults },
    { status: allErrored ? 500 : 200 },
  );
}
