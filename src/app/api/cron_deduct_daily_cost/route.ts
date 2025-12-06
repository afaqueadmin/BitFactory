import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }
  console.log("Cron Job Ran at", new Date());
  try {
    // Get all miners for all users with their associated user IDs
    const allMiners = await prisma.miner.findMany({
      include: {
        hardware: {
          select: {
            model: true,
            powerUsage: true,
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

    // Group miners by userId and calculate costs
    const userMinersMap = new Map<
      string,
      Array<{
        id: string;
        name: string;
        model: string;
        status: string;
        powerUsage: number;
      }>
    >();

    for (const miner of allMiners) {
      if (!userMinersMap.has(miner.userId)) {
        userMinersMap.set(miner.userId, []);
      }
      userMinersMap.get(miner.userId)!.push({
        id: miner.id,
        name: miner.name,
        model: miner.hardware?.model || "Unknown",
        status: miner.status,
        powerUsage: miner.hardware?.powerUsage || 0,
      });
    }

    // Process each user's miners
    const results = [];

    for (const [userId, userMiners] of userMinersMap) {
      // Calculate total consumption and daily cost for this user
      let totalConsumption = 0;
      let totalDailyCost = 0;

      for (const miner of userMiners) {
        // Only count active miners for consumption
        if (miner.status !== "INACTIVE") {
          // powerUsage is already in kW
          totalConsumption += miner.powerUsage;
          totalDailyCost += miner.powerUsage * latestRate.rate_per_kwh * 24;
        }
      }
      totalDailyCost = Number(
        (Math.round(totalDailyCost * 100) / 100).toFixed(2),
      );
      // Create an entry in cost_payments table
      if (totalDailyCost > 0) {
        const costPayment = await prisma.costPayment.create({
          data: {
            userId,
            amount: -totalDailyCost, // negative because it's a charge
            consumption: totalConsumption,
            type: "ELECTRICITY_CHARGES",
          },
        });

        results.push({
          userId,
          minerCount: userMiners.length,
          totalConsumption,
          totalDailyCost,
          costPaymentId: costPayment.id,
        });
      }
    }

    return NextResponse.json({
      success: true,
      ratePerKwh: latestRate.rate_per_kwh,
      rateValidFrom: latestRate.valid_from,
      totalUsersProcessed: results.length,
      results,
    });
  } catch (error) {
    console.error("Error processing daily costs:", error);
    return NextResponse.json(
      { error: `Failed to process daily costs: ${error}` },
      { status: 500 },
    );
  }
}
