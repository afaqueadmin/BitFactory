import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and get user ID
    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get all miners for this user
    const miners = await prisma.miner.findMany({
      where: { userId },
      include: {
        hardware: {
          select: {
            model: true,
            powerUsage: true,
          },
        },
        space: {
          select: {
            location: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Calculate daily costs for each miner with per-miner rates
    const minerCosts = await Promise.all(
      miners.map(async (miner) => {
        // Get the latest rate for this specific miner
        const latestMinerRate = await prisma.minerRateHistory.findFirst({
          where: { minerId: miner.id },
          orderBy: { createdAt: "desc" },
          select: { rate_per_kwh: true },
        });

        const ratePerKwh = latestMinerRate
          ? Number(latestMinerRate.rate_per_kwh)
          : 0;

        if (ratePerKwh === 0 && miner.status !== "INACTIVE") {
          console.warn(
            `[Daily Costs] Warning: No rate history found for miner ${miner.id} (${miner.name}), using 0`,
          );
        }

        const powerUsageKw = miner.hardware?.powerUsage || 0;

        // If miner is inactive, cost per day is 0
        let dailyCost = 0;
        if (miner.status !== "INACTIVE") {
          // Formula: powerUsage (kW) * ratePerKwh * 24 hours
          dailyCost = powerUsageKw * ratePerKwh * 24;
        }

        return {
          minerId: miner.id,
          minerName: miner.name,
          minerModel: miner.hardware?.model || "Unknown",
          status: miner.status,
          powerUsage: powerUsageKw,
          location: miner.space?.location || "Unknown",
          ratePerKwh: ratePerKwh,
          dailyCost,
        };
      }),
    );

    // Calculate total daily cost
    const totalDailyCost = minerCosts.reduce(
      (sum, miner) => sum + miner.dailyCost,
      0,
    );

    return NextResponse.json({
      userId,
      minerCount: miners.length,
      miners: minerCosts,
      totalDailyCost,
    });
  } catch (error) {
    console.error("Error calculating miner costs:", error);
    return NextResponse.json(
      { error: `Failed to calculate miner costs ${error}` },
      { status: 500 },
    );
  }
}
