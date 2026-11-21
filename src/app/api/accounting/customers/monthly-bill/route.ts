import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
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
    const auth = await authorizeStaff(request, [
      "invoicing.view",
      "invoicing.create",
      "invoicing.edit",
    ]);
    if ("response" in auth) return auth.response;

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
