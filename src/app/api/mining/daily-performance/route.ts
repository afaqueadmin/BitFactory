import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import {
  createLuxorClient,
  RevenueResponse,
  RevenueData,
  LuxorError,
} from "@/lib/luxor";
import { createBraiinsClient } from "@/lib/braiins";

interface DailyPerformanceData {
  date: string;
  earnings: number;
  costs: number;
  hashRate: number;
  breakdown?: {
    luxor: number;
    braiins: number;
  };
}

/**
 * GET /api/mining/daily-performance?days=10
 * Fetches daily mining revenue data from Luxor API /pool/revenue/BTC endpoint
 * Returns 10 days of earnings data for the user's Luxor subaccount
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and extract user ID
    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error(
        "[Mining Performance API] Token verification failed:",
        error,
      );
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get days parameter from query (default to 10 days)
    const daysParam = request.nextUrl.searchParams.get("days");
    const days = parseInt(daysParam || "10", 10);

    if (isNaN(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: "Days must be between 1 and 365" },
        { status: 400 },
      );
    }

    console.log(
      `[Mining Performance API] Fetching ${days} days of mining revenue data for user ${userId}`,
    );

    // Get PoolAuth entries for this user (contains API keys). Which pools
    // are active is determined directly from PoolAuth, not from
    // Miner.poolId - a Braiins/Luxor account is authenticated independently
    // of whether any Miner row happens to be tagged with that pool.
    const poolAuths = await prisma.poolAuth.findMany({
      where: { userId },
      include: { pool: { select: { id: true, name: true } } },
    });

    if (!poolAuths || poolAuths.length === 0) {
      console.warn(
        `[Mining Performance API] User ${userId} has no pool accounts configured`,
      );
      // Return empty successful response so frontend components can render
      // a friendly 'no data' message instead of an error.
      return NextResponse.json(
        {
          success: true,
          data: [],
          summary: {
            daysReturned: 0,
            totalEarnings: 0,
            averageDailyEarnings: 0,
            currency: "BTC",
            dataSource: "none",
            poolBreakdown: { luxor: 0, braiins: 0 },
          },
          timestamp: new Date().toISOString(),
        },
        { status: 200 },
      );
    }

    const luxorAuth = poolAuths.find((auth) =>
      auth.pool.name.toLowerCase().includes("luxor"),
    );
    const braiinsAuth = poolAuths.find((auth) =>
      auth.pool.name.toLowerCase().includes("braiins"),
    );

    // Calculate start_date and end_date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const startDate = new Date(yesterday);
    startDate.setDate(startDate.getDate() - days);

    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(yesterday);

    console.log(
      `[Mining Performance API] Fetching revenue from ${startDateStr} to ${endDateStr}`,
    );

    // Map to store daily performance data by date
    const performanceByDate: Map<string, { luxor: number; braiins: number }> =
      new Map();

    // Fetch from Luxor
    if (luxorAuth) {
      try {
        const authKey = luxorAuth.authKey;
        console.log(
          `[Mining Performance API] Fetching Luxor revenue for auth key: ${authKey}`,
        );
        const luxorClient = createLuxorClient(authKey);
        const revenueResponse = await luxorClient.getRevenue("BTC", {
          subaccount_names: authKey,
          start_date: startDateStr,
          end_date: endDateStr,
        });

        if (revenueResponse && Array.isArray(revenueResponse.revenue)) {
          for (const item of revenueResponse.revenue) {
            if (item && typeof item === "object") {
              const dateStr =
                item.date_time && typeof item.date_time === "string"
                  ? item.date_time.split("T")[0]
                  : null;

              if (!dateStr) continue;

              let btcRevenue = 0;
              if (item.revenue && typeof item.revenue === "object") {
                const revenueObj = item.revenue as Record<string, unknown>;
                btcRevenue = Number(revenueObj.revenue || 0) || 0;
              }

              if (!performanceByDate.has(dateStr)) {
                performanceByDate.set(dateStr, { luxor: 0, braiins: 0 });
              }
              const dayData = performanceByDate.get(dateStr)!;
              dayData.luxor += btcRevenue;
            }
          }
        }
      } catch (error) {
        console.error(
          `[Mining Performance API] Error fetching Luxor revenue:`,
          error,
        );
      }
    }

    // Fetch from Braiins
    if (braiinsAuth) {
      try {
        const authKey = braiinsAuth.authKey;
        console.log(
          `[Mining Performance API] Fetching Braiins daily hashrate/rewards for auth key: ${authKey}`,
        );
        const braiinsClient = createBraiinsClient(authKey);
        const rewards = await braiinsClient.getDailyRewards({
          from: startDateStr,
          to: endDateStr,
        });

        if (rewards?.btc?.daily_rewards) {
          for (const reward of rewards.btc.daily_rewards) {
            // Convert Unix timestamp to ISO date string
            const date = new Date(reward.date * 1000);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            const dateStr = `${year}-${month}-${day}`;
            const amount = parseFloat(reward.total_reward) || 0;

            if (!performanceByDate.has(dateStr)) {
              performanceByDate.set(dateStr, { luxor: 0, braiins: 0 });
            }
            const dayData = performanceByDate.get(dateStr)!;
            dayData.braiins += amount;
          }
        }
      } catch (error) {
        console.error(
          `[Mining Performance API] Error fetching Braiins rewards:`,
          error,
        );
      }
    }

    // Convert map to array and sort
    const performanceData: DailyPerformanceData[] = Array.from(
      performanceByDate.entries(),
    )
      .map(([date, data]) => ({
        date,
        earnings: data.luxor + data.braiins,
        costs: 0,
        hashRate: 0,
        breakdown: {
          luxor: parseFloat(data.luxor.toFixed(8)),
          braiins: parseFloat(data.braiins.toFixed(8)),
        },
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate summary statistics
    const totalEarnings = performanceData.reduce(
      (sum, d) => sum + d.earnings,
      0,
    );
    const totalLuxorEarnings = performanceData.reduce(
      (sum, d) => sum + (d.breakdown?.luxor || 0),
      0,
    );
    const totalBraiinsEarnings = performanceData.reduce(
      (sum, d) => sum + (d.breakdown?.braiins || 0),
      0,
    );
    const avgEarnings =
      performanceData.length > 0 ? totalEarnings / performanceData.length : 0;

    console.log(
      `[Mining Performance API] Returning ${performanceData.length} days of revenue data`,
    );

    return NextResponse.json(
      {
        success: true,
        data: performanceData,
        summary: {
          daysReturned: performanceData.length,
          totalEarnings: parseFloat(totalEarnings.toFixed(8)),
          averageDailyEarnings: parseFloat(avgEarnings.toFixed(8)),
          currency: "BTC",
          dataSource: "both",
          poolBreakdown: {
            luxor: parseFloat(totalLuxorEarnings.toFixed(8)),
            braiins: parseFloat(totalBraiinsEarnings.toFixed(8)),
          },
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    // Handle LuxorError specifically
    if (error instanceof LuxorError) {
      console.error(
        `[Mining Performance API] Luxor API error (${error.statusCode}): ${error.message}`,
      );
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          details: error.errorDetails,
        },
        { status: error.statusCode || 500 },
      );
    }

    console.error("[Mining Performance API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch mining performance data from Luxor API",
      },
      { status: 500 },
    );
  }
}
