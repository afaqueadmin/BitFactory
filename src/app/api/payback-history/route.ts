import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import {
  getRangeStartDate,
  isPaybackHistoryRange,
  PaybackHistoryRange,
} from "@/lib/helpers/paybackHistoryRange";
import { resolvePaybackAccountType } from "@/lib/helpers/paybackAccountType";

/**
 * GET /api/payback-history?range=30D|90D|1Y|ALL&miner=S21PRO|S21XP
 *
 * Historical BTC price vs. Stock/Custom OS breakeven price series for the
 * "Cost to Mine vs Buy BTC" chart. Any authenticated user. Reads CLIENT
 * fields by default, or COMPANY fields for self-mining accounts
 * (User.segment === "SELF_MINING") — same rule as /api/payback-config.
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
      console.error("[Payback History API] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { segment: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const accountType = resolvePaybackAccountType(user.segment);

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

    const data = snapshots.map((snapshot) => {
      const stockOsBreakeven =
        accountType === "SELF_MINING"
          ? miner === "S21XP"
            ? snapshot.companyS21XpStockBreakeven
            : snapshot.companyS21ProStockBreakeven
          : miner === "S21XP"
            ? snapshot.clientS21XpStockBreakeven
            : snapshot.clientS21ProStockBreakeven;

      const customOsBreakeven =
        accountType === "SELF_MINING"
          ? miner === "S21XP"
            ? snapshot.companyS21XpCustomBreakeven
            : snapshot.companyS21ProCustomBreakeven
          : miner === "S21XP"
            ? snapshot.clientS21XpCustomBreakeven
            : snapshot.clientS21ProCustomBreakeven;

      return {
        date: snapshot.date.toISOString().slice(0, 10),
        btcPriceUsd: Number(snapshot.btcCloseUsd),
        stockOsBreakeven: Number(stockOsBreakeven),
        customOsBreakeven: Number(customOsBreakeven),
      };
    });

    return NextResponse.json({
      success: true,
      range,
      miner,
      accountType,
      data,
    });
  } catch (error) {
    console.error("[Payback History API] Error:", error);
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
