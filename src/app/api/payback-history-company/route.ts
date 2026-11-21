import { NextRequest, NextResponse } from "next/server";
import {
  getAuthorizationContext,
  requirePermission,
} from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import {
  getRangeStartDate,
  isPaybackHistoryRange,
  PaybackHistoryRange,
} from "@/lib/helpers/paybackHistoryRange";

/**
 * GET /api/payback-history-company?range=30D|90D|1Y|ALL&miner=S21PRO|S21XP
 *
 * Historical BTC price vs. COMPANY (self-mining) Stock/Custom OS breakeven
 * price series for the "Buy BTC vs Mine BTC" chart. Admin-only, matching
 * /api/payback-config-company.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "company_payback.view");
    if (denied) return denied;

    const rangeParam = request.nextUrl.searchParams.get("range");
    const range: PaybackHistoryRange = isPaybackHistoryRange(rangeParam)
      ? rangeParam
      : "30D";

    const minerParam = request.nextUrl.searchParams.get("miner");
    const miner: "S21PRO" | "S21XP" =
      minerParam === "S21XP" ? "S21XP" : "S21PRO";

    const startDate = getRangeStartDate(range);

    const snapshots = await prisma.paybackDailySnapshot.findMany({
      where: startDate ? { date: { gte: startDate } } : {},
      orderBy: { date: "asc" },
    });

    const data = snapshots.map((snapshot) => ({
      date: snapshot.date.toISOString().slice(0, 10),
      btcPriceUsd: Number(snapshot.btcCloseUsd),
      stockOsBreakeven: Number(
        miner === "S21XP"
          ? snapshot.companyS21XpStockBreakeven
          : snapshot.companyS21ProStockBreakeven,
      ),
      customOsBreakeven: Number(
        miner === "S21XP"
          ? snapshot.companyS21XpCustomBreakeven
          : snapshot.companyS21ProCustomBreakeven,
      ),
      hashpriceBtcPerPhDay: Number(snapshot.hashpriceBtcPerPhDay),
    }));

    return NextResponse.json({ success: true, range, miner, data });
  } catch (error) {
    console.error("[Payback History Company API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch payback history",
      },
      { status: 500 },
    );
  }
}
