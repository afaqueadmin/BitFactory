import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient } from "@/lib/luxor";
import { createBraiinsClient } from "@/lib/braiins";
import { groupMinersByPool, getLuxorGroups, getBraiinsGroups } from "@/lib/poolAggregation";
import { prisma } from "@/lib/prisma";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function GET(
  req: NextRequest,
): Promise<NextResponse<ApiResponse>> {
  try {
    // Verify authentication
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const decoded = await verifyJwtToken(token);
    if (!decoded) {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    // Get user's miners
    const miners = await prisma.miner.findMany({
      where: { userId: decoded.userId },
      include: {
        pool: { select: { id: true, name: true } },
      },
    });

    if (!miners || miners.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: {
            revenue_usd: 0,
            revenue_crypto: 0,
            transaction_count: 0,
            currency: "BTC",
            poolBreakdown: {
              luxor: { transactions: 0, revenue_crypto: 0, revenue_usd: 0 },
              braiins: { transactions: 0, revenue_crypto: 0, revenue_usd: 0 },
            },
          },
        },
        { status: 200 },
      );
    }

    // Get PoolAuth entries for this user (contains API keys)
    const poolAuths = await prisma.poolAuth.findMany({
      where: { userId: decoded.userId },
      include: { pool: { select: { id: true, name: true } } },
    });

    // Create a map of poolId -> authKey for quick lookup
    const authKeyByPoolId = new Map<string, string>();
    poolAuths.forEach((auth) => {
      authKeyByPoolId.set(auth.poolId, auth.authKey);
    });

    // Group miners by pool
    const aggregation = groupMinersByPool(miners);
    const luxorGroups = getLuxorGroups(aggregation);
    const braiinsGroups = getBraiinsGroups(aggregation);

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const currency = searchParams.get("currency") || "BTC";

    // Calculate date range for last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const startDate = new Date(yesterday.getTime() - 24 * 60 * 60 * 1000);

    const formatDate = (date: Date) => date.toISOString().split("T")[0];
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(yesterday);

    console.log(
      `[Wallet API] Fetching 24h revenue for ${currency} from ${startDateStr} to ${endDateStr}`,
    );

    let luxorRevenueCrypto = 0;
    let luxorRevenueUsd = 0;
    let luxorTransactionCount = 0;
    let braiinsRevenueCrypto = 0;
    let braiinsTransactionCount = 0;

    // Fetch from Luxor groups
    for (const group of luxorGroups) {
      try {
        // Get the poolId from the first miner in the group to look up auth
        const minerWithPool = group.miners[0];
        const poolId = minerWithPool?.poolId;

        if (!poolId) {
          console.warn(
            `[24h Revenue API] Luxor group has no poolId, skipping`,
          );
          continue;
        }

        const authKey = authKeyByPoolId.get(poolId);
        if (!authKey) {
          console.warn(
            `[24h Revenue API] No auth key found for Luxor pool ${poolId}`,
          );
          continue;
        }

        const luxorClient = createLuxorClient(authKey);
        const response = await luxorClient.getTransactions(currency, {
          start_date: startDateStr,
          end_date: endDateStr,
          transaction_type: "credit",
          page_size: 1000,
          subaccount_names: authKey,
        });

        if (response?.transactions) {
          luxorTransactionCount += response.transactions.length;
          for (const tx of response.transactions) {
            luxorRevenueCrypto += tx.currency_amount || 0;
            luxorRevenueUsd += tx.usd_equivalent || 0;
          }
        }
      } catch (error) {
        console.error(`[Wallet API] Error fetching Luxor transactions:`, error);
      }
    }

    // Fetch from Braiins groups (use daily rewards for 24h earnings)
    for (const group of braiinsGroups) {
      try {
        // Get the poolId from the first miner in the group to look up auth
        const minerWithPool = group.miners[0];
        const poolId = minerWithPool?.poolId;

        if (!poolId) {
          console.warn(
            `[24h Revenue API] Braiins group has no poolId, skipping`,
          );
          continue;
        }

        const authKey = authKeyByPoolId.get(poolId);
        if (!authKey) {
          console.warn(
            `[24h Revenue API] No auth key found for Braiins pool ${poolId}`,
          );
          continue;
        }

        const braiinsClient = createBraiinsClient(authKey);
        const rewards = await braiinsClient.getDailyRewards({
          from: formatDate(startDate),
          to: formatDate(yesterday),
        });

        if (rewards?.btc?.daily_rewards) {
          braiinsTransactionCount += rewards.btc.daily_rewards.length;
          for (const reward of rewards.btc.daily_rewards) {
            braiinsRevenueCrypto += parseFloat(reward.total_reward) || 0;
          }
        }
      } catch (error) {
        console.error(`[Wallet API] Error fetching Braiins daily rewards:`, error);
      }
    }

    const totalRevenueCrypto = luxorRevenueCrypto + braiinsRevenueCrypto;
    const totalRevenueUsd = luxorRevenueUsd;
    const totalTransactionCount = luxorTransactionCount + braiinsTransactionCount;

    return NextResponse.json(
      {
        success: true,
        data: {
          revenue_usd: parseFloat(totalRevenueUsd.toFixed(2)),
          revenue_crypto: parseFloat(totalRevenueCrypto.toFixed(8)),
          transaction_count: totalTransactionCount,
          currency,
          poolBreakdown: {
            luxor: {
              transactions: luxorTransactionCount,
              revenue_crypto: parseFloat(luxorRevenueCrypto.toFixed(8)),
              revenue_usd: parseFloat(luxorRevenueUsd.toFixed(2)),
            },
            braiins: {
              transactions: braiinsTransactionCount,
              revenue_crypto: parseFloat(braiinsRevenueCrypto.toFixed(8)),
              revenue_usd: 0,
            },
          },
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Wallet API] Revenue 24h error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
