import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import {
  latestRateByMiner,
  minerMonthlyHostingUsd,
} from "@/lib/accounting/minerMonthlyHosting";

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

    if (!user || !isStaffRole(user.role)) {
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

    const rates = await latestRateByMiner(autoMiners.map((m) => m.id));

    const monthlyBills: Record<string, number> = {};
    for (const miner of autoMiners) {
      const powerUsageKw = miner.hardware?.powerUsage || 0;
      const ratePerKwh = rates.get(miner.id) || 0;
      const monthlyCost = minerMonthlyHostingUsd(ratePerKwh, powerUsageKw);

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
