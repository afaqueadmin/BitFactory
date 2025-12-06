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

    // Get the latest electricity rate
    const latestRate = await prisma.electricityRate.findFirst({
      where: {
        valid_from: {
          lte: new Date(),
        },
      },
      orderBy: {
        valid_from: "desc",
      },
      select: {
        id: true,
        rate_per_kwh: true,
        valid_from: true,
      },
    });

    if (!latestRate) {
      return NextResponse.json(
        { error: "No electricity rate found" },
        { status: 404 },
      );
    }

    // Calculate daily costs for each miner
    const minerCosts = miners.map((miner) => {
      // If miner is inactive, cost per day is 0
      if (miner.status === "INACTIVE") {
        return {
          minerId: miner.id,
          minerName: miner.name,
          minerModel: miner.hardware?.model || "Unknown",
          status: miner.status,
          powerUsage: miner.hardware?.powerUsage || 0,
          location: miner.space?.location || "Unknown",
          ratePerKwh: latestRate.rate_per_kwh,
          dailyCost: 0,
        };
      }

      // Formula: powerUsage (kW) * ratePerKwh * 24 hours
      const powerUsageKw = miner.hardware?.powerUsage || 0;
      const dailyCost = powerUsageKw * latestRate.rate_per_kwh * 24;

      return {
        minerId: miner.id,
        minerName: miner.name,
        minerModel: miner.hardware?.model || "Unknown",
        status: miner.status,
        powerUsage: powerUsageKw,
        location: miner.space?.location || "Unknown",
        ratePerKwh: latestRate.rate_per_kwh,
        dailyCost,
      };
    });

    // Calculate total daily cost
    const totalDailyCost = minerCosts.reduce(
      (sum, miner) => sum + miner.dailyCost,
      0,
    );

    return NextResponse.json({
      userId,
      minerCount: miners.length,
      ratePerKwh: latestRate.rate_per_kwh,
      rateValidFrom: latestRate.valid_from,
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
