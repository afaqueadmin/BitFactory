import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

const HOURS_PER_DAY = 24;
const AVG_DAYS_PER_MONTH = 365 / 12;

/**
 * GET /api/accounting/customers/monthly-bill
 *
 * Returns the expected monthly hosting bill for every customer, keyed by
 * customer id: sum over each of their AUTO miners of
 * (rate_per_kwh * hardware.powerUsage * 24 * 365/12). Uses the same
 * per-miner rate/power source as the real daily cost deduction cron
 * (cron_deduct_daily_cost), so the figure matches what actually gets
 * charged to the customer's balance over a month.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access customer monthly bills" },
        { status: 403 },
      );
    }

    const autoMiners = await prisma.miner.findMany({
      where: { status: "AUTO", isDeleted: false },
      select: {
        id: true,
        userId: true,
        hardware: { select: { powerUsage: true } },
      },
    });

    const rateHistories = await prisma.minerRateHistory.findMany({
      where: { minerId: { in: autoMiners.map((m) => m.id) } },
      orderBy: { createdAt: "desc" },
      select: { minerId: true, rate_per_kwh: true },
    });

    const latestRateByMiner = new Map<string, number>();
    for (const rh of rateHistories) {
      if (!latestRateByMiner.has(rh.minerId)) {
        latestRateByMiner.set(rh.minerId, Number(rh.rate_per_kwh));
      }
    }

    const monthlyBills: Record<string, number> = {};
    for (const miner of autoMiners) {
      const powerUsageKw = miner.hardware?.powerUsage || 0;
      const ratePerKwh = latestRateByMiner.get(miner.id) || 0;
      const monthlyCost =
        powerUsageKw * ratePerKwh * HOURS_PER_DAY * AVG_DAYS_PER_MONTH;

      monthlyBills[miner.userId] =
        (monthlyBills[miner.userId] || 0) + monthlyCost;
    }

    return NextResponse.json({ monthlyBills });
  } catch (error) {
    console.error("Failed to fetch customer monthly bills:", error);
    return NextResponse.json(
      { error: "Failed to fetch customer monthly bills" },
      { status: 500 },
    );
  }
}
