import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

const HOURS_PER_DAY = 24;
const AVG_DAYS_PER_MONTH = 365 / 12;

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access miners" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { error: "Missing required parameter: customerId" },
        { status: 400 },
      );
    }

    // Build where clause - fetch miners with status='AUTO' and not deleted
    const where: Record<string, unknown> = {
      userId: customerId,
      status: "AUTO",
      isDeleted: false,
    };

    // Fetch miners for the customer (only with status=AUTO)
    const miners = await prisma.miner.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        hardwareId: true,
        hardware: {
          select: { id: true, model: true, powerUsage: true },
        },
        space: {
          select: { id: true, name: true, location: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Each miner counts as 1, so total is the count
    const totalActiveMiners = miners.length;

    // Latest rate_per_kwh per miner (same source used by the daily-cost cron
    // and the monthly-bill estimate)
    const rateHistories = await prisma.minerRateHistory.findMany({
      where: { minerId: { in: miners.map((m) => m.id) } },
      orderBy: { createdAt: "desc" },
      select: { minerId: true, rate_per_kwh: true },
    });

    const latestRateByMiner = new Map<string, number>();
    for (const rh of rateHistories) {
      if (!latestRateByMiner.has(rh.minerId)) {
        latestRateByMiner.set(rh.minerId, Number(rh.rate_per_kwh));
      }
    }

    // Group miners by (hardwareId, rate) so miners of the same model but a
    // different negotiated rate become separate invoice line items.
    const groups = new Map<
      string,
      {
        hardwareId: string;
        model: string;
        rate: number;
        powerUsage: number;
        quantity: number;
      }
    >();

    for (const miner of miners) {
      if (!miner.hardware) continue;
      const rate = latestRateByMiner.get(miner.id) || 0;
      const key = `${miner.hardwareId}:${rate}`;
      const existing = groups.get(key);
      if (existing) {
        existing.quantity += 1;
      } else {
        groups.set(key, {
          hardwareId: miner.hardwareId,
          model: miner.hardware.model,
          rate,
          powerUsage: miner.hardware.powerUsage,
          quantity: 1,
        });
      }
    }

    const lineItems = Array.from(groups.values()).map((group) => {
      const suggestedUnitPrice = Math.round(
        group.rate * group.powerUsage * HOURS_PER_DAY * AVG_DAYS_PER_MONTH,
      );

      return {
        hardwareId: group.hardwareId,
        model: group.model,
        rate: group.rate,
        quantity: group.quantity,
        suggestedUnitPrice,
        suggestedTotalPrice: suggestedUnitPrice * group.quantity,
      };
    });

    return NextResponse.json({
      miners,
      totalActiveMiners,
      lineItems,
    });
  } catch (error) {
    console.error("Failed to fetch miners:", error);
    return NextResponse.json(
      { error: "Failed to fetch miners" },
      { status: 500 },
    );
  }
}
