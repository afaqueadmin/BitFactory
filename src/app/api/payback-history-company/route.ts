import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
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
 * price series for the "Cost to Mine vs Buy BTC" chart. Admin-only, matching
 * /api/payback-config-company.
 */
export async function GET(request: NextRequest) {
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
        "[Payback History Company API] Token verification failed:",
        error,
      );
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
