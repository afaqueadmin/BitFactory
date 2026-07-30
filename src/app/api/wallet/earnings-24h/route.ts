import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient } from "@/lib/luxor";
import { createBraiinsClient } from "@/lib/braiins";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/wallet/earnings-24h
 *
 * Fetches 24-hour earnings (revenue) from Luxor API
 * Returns aggregated data across all subaccounts for the last 24 hours
 *
 * Response:
 * {
 *   revenue24h: { btc: number, usd: number },
 *   currency: "BTC",
 *   timestamp: string,
 *   dataSource: "luxor"
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication via JWT token in cookies
    const token = request.cookies.get("token")?.value;
    if (!token) {
      console.log("[24h Revenue API] Unauthorized access attempt - no token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch (error) {
      console.log("[24h Revenue API] Invalid token:", error);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = decoded.userId;
    console.log(`[24h Revenue API] Fetching data for user: ${userId}`);

    // Get PoolAuth entries for this user (contains API keys). Which pools
    // are active is determined directly from PoolAuth, not from
    // Miner.poolId - a Braiins/Luxor account is authenticated independently
    // of whether any Miner row happens to be tagged with that pool.
    const poolAuths = await prisma.poolAuth.findMany({
      where: { userId },
      include: { pool: { select: { id: true, name: true } } },
    });

    if (!poolAuths || poolAuths.length === 0) {
      console.log(`[24h Revenue API] User ${userId} has no pool accounts`);
      return NextResponse.json(
        {
          revenue24h: { btc: 0, usd: 0 },
          currency: "BTC",
          timestamp: new Date().toISOString(),
          dataSource: "none",
          poolBreakdown: {
            luxor: { btc: 0, usd: 0 },
            braiins: { btc: 0, usd: 0 },
          },
          message: "No pool accounts configured",
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

    // Calculate date range - last 24 hours
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    const formatDate = (date: Date) => date.toISOString().split("T")[0];

    let totalRevenueBtc = 0;
    let totalRevenueUsd = 0;
    let luxorRevenueBtc = 0;
    let luxorRevenueUsd = 0;
    let braiinsRevenueBtc = 0;

    // Fetch from Luxor
    if (luxorAuth) {
      try {
        const authKey = luxorAuth.authKey;
        console.log(
          `[24h Revenue API] Fetching Luxor transactions for auth key: ${authKey}`,
        );
        const client = createLuxorClient(authKey);
        const transactions = await client.getTransactions("BTC", {
          transaction_type: "credit",
          start_date: formatDate(startDate),
          end_date: formatDate(endDate),
          subaccount_names: authKey,
          page_size: 1000,
        });

        if (transactions.transactions) {
          for (const tx of transactions.transactions) {
            luxorRevenueBtc += tx.currency_amount;
            luxorRevenueUsd += tx.usd_equivalent;
          }
        }
      } catch (error) {
        console.error(
          `[24h Revenue API] Error fetching Luxor transactions:`,
          error,
        );
      }
    }

    // Fetch from Braiins (use daily rewards for 24h earnings)
    if (braiinsAuth) {
      try {
        const authKey = braiinsAuth.authKey;
        console.log(
          `[24h Revenue API] Fetching Braiins daily rewards for auth key: ${authKey}`,
        );
        const braiinsClient = createBraiinsClient(authKey);
        const rewards = await braiinsClient.getDailyRewards({
          from: formatDate(startDate),
          to: formatDate(endDate),
        });

        if (rewards?.btc?.daily_rewards) {
          for (const reward of rewards.btc.daily_rewards) {
            braiinsRevenueBtc += parseFloat(reward.total_reward) || 0;
          }
        }
      } catch (error) {
        console.error(
          `[24h Revenue API] Error fetching Braiins daily rewards:`,
          error,
        );
      }
    }

    totalRevenueBtc = luxorRevenueBtc + braiinsRevenueBtc;
    totalRevenueUsd = luxorRevenueUsd;

    // Determine which pools have a configured account
    const activePoolNames = [];
    if (luxorAuth) activePoolNames.push("Luxor");
    if (braiinsAuth) activePoolNames.push("Braiins");

    return NextResponse.json({
      revenue24h: {
        btc: Number(totalRevenueBtc.toFixed(8)),
        usd: Number(totalRevenueUsd.toFixed(2)),
      },
      currency: "BTC",
      timestamp: new Date().toISOString(),
      dataSource:
        luxorAuth && braiinsAuth ? "both" : luxorAuth ? "luxor" : "braiins",
      activePoolNames,
      poolBreakdown: {
        luxor: {
          btc: Number(luxorRevenueBtc.toFixed(8)),
          usd: Number(luxorRevenueUsd.toFixed(2)),
        },
        braiins: {
          btc: Number(braiinsRevenueBtc.toFixed(8)),
          usd: 0,
        },
      },
    });
  } catch (error) {
    console.error("[24h Revenue API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch 24-hour earnings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
