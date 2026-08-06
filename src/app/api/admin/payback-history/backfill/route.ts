import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import {
  toUtcDateOnly,
  upsertSnapshotForDate,
} from "@/lib/services/paybackSnapshotService";

// Luxor's historical hashprice data only goes back ~45 days, so backfilling
// further would have no hashprice to compute breakeven prices with.
const MAX_BACKFILL_DAYS = 45;
const DEFAULT_BACKFILL_DAYS = 45;

interface BackfillDayResult {
  date: string;
  status: "written" | "skipped" | "error";
  error?: string;
}

/**
 * POST /api/admin/payback-history/backfill
 *
 * Admin-only maintenance endpoint. Backfills the latest 45 completed UTC
 * days of payback daily snapshots using Binance daily close + Luxor
 * historical hashprice + the *current* CLIENT/COMPANY config. Idempotent:
 * reruns skip any day that already has a valid snapshot.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userRole = decoded.role;
    } catch (error) {
      console.error(
        "[Payback History Backfill] Token verification failed:",
        error,
      );
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const daysParam = request.nextUrl.searchParams.get("days");
    const parsedDays = daysParam
      ? parseInt(daysParam, 10)
      : DEFAULT_BACKFILL_DAYS;
    const backfillDays =
      Number.isFinite(parsedDays) && parsedDays > 0
        ? Math.min(parsedDays, MAX_BACKFILL_DAYS)
        : DEFAULT_BACKFILL_DAYS;

    const today = toUtcDateOnly(new Date());
    const results: BackfillDayResult[] = [];

    for (let daysAgo = 1; daysAgo <= backfillDays; daysAgo++) {
      const targetDate = new Date(today);
      targetDate.setUTCDate(targetDate.getUTCDate() - daysAgo);

      try {
        const result = await upsertSnapshotForDate(targetDate);
        results.push(result);
      } catch (error) {
        const dateKey = targetDate.toISOString().slice(0, 10);
        console.error(
          `[Payback History Backfill] Failed for ${dateKey}:`,
          error,
        );
        results.push({
          date: dateKey,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const summary = {
      written: results.filter((r) => r.status === "written").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errored: results.filter((r) => r.status === "error").length,
    };

    return NextResponse.json({ success: true, summary, results });
  } catch (error) {
    console.error("[Payback History Backfill] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Backfill failed",
      },
      { status: 500 },
    );
  }
}
