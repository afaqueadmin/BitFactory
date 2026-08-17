import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { toUtcDateOnly } from "@/lib/services/paybackSnapshotService";

interface DailyPerformanceData {
  date: string;
  earnings: number;
  costs: number;
  hashRate: number;
  breakdown?: {
    luxor: number;
    braiins: number;
    luxorRebate: number;
  };
}

/**
 * GET /api/mining/daily-performance?days=10
 * GET /api/mining/daily-performance?granularity=monthly
 *
 * Revenue breakdown for the dashboard's "Mining Performance" chart, read
 * from PoolSubaccountDailySnapshot (populated by /api/cron_pool_daily_snapshot)
 * instead of calling Luxor/Braiins live.
 *
 * Daily mode: window is [yesterday - days, yesterday]. Monthly mode: every
 * fully-closed calendar month since data began, one bucket per month. Both
 * modes exclude anything not yet closed — the daily window never reaches
 * "today", and the monthly bucketing explicitly drops the current
 * in-progress month — so every bucket returned is already finalized and no
 * live fallback is needed.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error(
        "[Mining Performance API] Token verification failed:",
        error,
      );
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const granularityParam = request.nextUrl.searchParams.get("granularity");
    const granularity = granularityParam === "monthly" ? "monthly" : "daily";

    const today = toUtcDateOnly(new Date());
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    let startDate: Date;
    let days = 0;

    if (granularity === "daily") {
      const daysParam = request.nextUrl.searchParams.get("days");
      days = parseInt(daysParam || "10", 10);

      if (isNaN(days) || days < 1 || days > 365) {
        return NextResponse.json(
          { error: "Days must be between 1 and 365" },
          { status: 400 },
        );
      }

      // Same window the live route used: yesterday, then back `days` more
      // days (so the range is actually `days + 1` days inclusive — matches
      // the original route's exact math: startDate = yesterday - days).
      startDate = new Date(yesterday);
      startDate.setUTCDate(startDate.getUTCDate() - days);
    } else {
      // Monthly: every fully-closed month since real data began. No fixed
      // floor needed here — the query just returns whatever exists.
      startDate = new Date("2020-01-01T00:00:00.000Z");
    }

    console.log(
      granularity === "daily"
        ? `[Mining Performance API] Reading ${days} days of DB revenue data for user ${userId}`
        : `[Mining Performance API] Reading monthly DB revenue data for user ${userId}`,
    );

    const subaccounts = await prisma.poolSubaccount.findMany({
      where: { userId, pool: { name: { in: ["Luxor", "Braiins"] } } },
      include: { pool: { select: { name: true } } },
    });

    if (subaccounts.length === 0) {
      console.warn(
        `[Mining Performance API] User ${userId} has no pool subaccounts`,
      );
      return NextResponse.json(
        {
          success: true,
          data: [],
          summary: {
            daysReturned: 0,
            totalEarnings: 0,
            averageDailyEarnings: 0,
            currency: "BTC",
            dataSource: "none",
            poolBreakdown: { luxor: 0, braiins: 0, luxorRebate: 0 },
          },
          timestamp: new Date().toISOString(),
        },
        { status: 200 },
      );
    }

    const poolNameBySubaccountId = new Map(
      subaccounts.map((s) => [s.id, s.pool.name]),
    );

    const snapshots = await prisma.poolSubaccountDailySnapshot.findMany({
      where: {
        poolSubaccountId: { in: subaccounts.map((s) => s.id) },
        date: { gte: startDate, lte: yesterday },
      },
    });

    // Monthly bucket key ("2026-08") vs daily ("2026-08-17") — the current,
    // still-open month is excluded explicitly below rather than relying on
    // the `lte: yesterday` query bound, since yesterday can still fall
    // inside the current month.
    const currentMonthKey = today.toISOString().slice(0, 7);
    const bucketKey = (date: Date) =>
      granularity === "monthly"
        ? date.toISOString().slice(0, 7)
        : date.toISOString().split("T")[0];

    const performanceByDate: Map<
      string,
      { luxor: number; braiins: number; luxorRebate: number }
    > = new Map();

    for (const snap of snapshots) {
      const key = bucketKey(snap.date);
      if (granularity === "monthly" && key === currentMonthKey) continue;

      const poolName = poolNameBySubaccountId.get(snap.poolSubaccountId);

      if (!performanceByDate.has(key)) {
        performanceByDate.set(key, { luxor: 0, braiins: 0, luxorRebate: 0 });
      }
      const dayData = performanceByDate.get(key)!;

      if (poolName === "Luxor") {
        // Matches the live route's grouping: MINING + REFERRAL combined into
        // the base "luxor" bar, LUXOS_REBATE (stored in otherRevenue) stacked
        // separately.
        dayData.luxor +=
          Number(snap.miningRevenue) + Number(snap.referralRevenue);
        dayData.luxorRebate += Number(snap.otherRevenue);
      } else if (poolName === "Braiins") {
        dayData.braiins += Number(snap.totalRevenue);
      }
    }

    const performanceData: DailyPerformanceData[] = Array.from(
      performanceByDate.entries(),
    )
      .map(([key, data]) => ({
        // Monthly buckets are keyed "YYYY-MM"; normalize to the month's
        // first day so the frontend's Date parsing works the same either way.
        date: granularity === "monthly" ? `${key}-01` : key,
        earnings: data.luxor + data.braiins + data.luxorRebate,
        costs: 0,
        hashRate: 0,
        breakdown: {
          luxor: parseFloat(data.luxor.toFixed(8)),
          braiins: parseFloat(data.braiins.toFixed(8)),
          luxorRebate: parseFloat(data.luxorRebate.toFixed(8)),
        },
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalEarnings = performanceData.reduce(
      (sum, d) => sum + d.earnings,
      0,
    );
    const totalLuxorEarnings = performanceData.reduce(
      (sum, d) => sum + (d.breakdown?.luxor || 0),
      0,
    );
    const totalBraiinsEarnings = performanceData.reduce(
      (sum, d) => sum + (d.breakdown?.braiins || 0),
      0,
    );
    const totalLuxorRebate = performanceData.reduce(
      (sum, d) => sum + (d.breakdown?.luxorRebate || 0),
      0,
    );
    const avgEarnings =
      performanceData.length > 0 ? totalEarnings / performanceData.length : 0;

    console.log(
      `[Mining Performance API] Returning ${performanceData.length} days of DB revenue data`,
    );

    return NextResponse.json(
      {
        success: true,
        data: performanceData,
        summary: {
          daysReturned: performanceData.length,
          totalEarnings: parseFloat(totalEarnings.toFixed(8)),
          averageDailyEarnings: parseFloat(avgEarnings.toFixed(8)),
          currency: "BTC",
          dataSource: "both",
          poolBreakdown: {
            luxor: parseFloat(totalLuxorEarnings.toFixed(8)),
            braiins: parseFloat(totalBraiinsEarnings.toFixed(8)),
            luxorRebate: parseFloat(totalLuxorRebate.toFixed(8)),
          },
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Mining Performance API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch mining performance data",
      },
      { status: 500 },
    );
  }
}
