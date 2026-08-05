import { NextRequest, NextResponse } from "next/server";
import {
  getPreviousCompletedUtcDay,
  upsertSnapshotForDate,
} from "@/lib/services/paybackSnapshotService";

/**
 * GET /api/cron_payback_snapshot
 *
 * Vercel cron endpoint, protected by CRON_SECRET. Runs shortly after UTC
 * midnight and snapshots the previous completed UTC day's BTC close price,
 * Luxor hashprice, and CLIENT/COMPANY breakeven prices for both miners/OS.
 * Upserts by date; never overwrites an existing valid snapshot.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const targetDate = getPreviousCompletedUtcDay();
    const result = await upsertSnapshotForDate(targetDate);

    console.log(`[Payback Snapshot Cron] ${result.date}: ${result.status}`);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Payback Snapshot Cron] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to snapshot payback history",
      },
      { status: 500 },
    );
  }
}
