import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { createLuxorClient, LuxorError } from "@/lib/luxor";
import { createBraiinsClient } from "@/lib/braiins";
import { groupMinersByPool, getLuxorGroups, getBraiinsGroups } from "@/lib/poolAggregation";

/**
 * GET /api/miners/summary
 *
 * Fetches pool summary statistics from Luxor including:
 * - Current hashprice
 * - Current hashrate (5m, 24h)
 * - Active miners count
 * - Revenue and balance info
 *
 * Returns Luxor's SummaryResponse directly to client
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
      console.error("[Miners Summary API] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Fetch the user's miners
    const miners = await prisma.miner.findMany({
      where: { userId },
      include: {
        pool: { select: { id: true, name: true } },
      },
    });

    if (!miners || miners.length === 0) {
      console.log(`[Miners Summary API] User ${userId} has no miners`);
      return NextResponse.json(
        {
          success: true,
          data: {
            totalHashrate: 0,
            activeMiners: 0,
            totalRevenue: 0,
            hashprice: 0,
            pools: {
              luxor: {
                miners: 0,
                hashrate: 0,
                revenue: 0,
              },
              braiins: {
                miners: 0,
                hashrate: 0,
                revenue: 0,
              },
            },
          },
          message: "No miners assigned",
        },
        { status: 200 },
      );
    }

    // Get PoolAuth entries for this user (contains API keys)
    const poolAuths = await prisma.poolAuth.findMany({
      where: { userId },
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

    // Aggregate data from both pools
    let totalHashrate = 0;
    let totalActiveMiners = 0;
    let totalRevenue = 0;
    let avgHashprice = 0;
    let hashpriceCount = 0;
    let efficiencyValues: number[] = [];
    let uptimeValues: number[] = [];

    const poolStats = {
      luxor: { miners: 0, hashrate: 0, activeWorkers: 0, hashprice: 0, efficiency_5m: 0, uptime_24h: 0 },
      braiins: { miners: 0, hashrate: 0, activeWorkers: 0, hashprice: 0, efficiency_5m: 0, uptime_24h: 0 },
    };

    // Fetch from Luxor groups
    for (const group of luxorGroups) {
      try {
        // Get the poolId from the first miner in the group to look up auth
        const minerWithPool = group.miners[0];
        const poolId = minerWithPool?.poolId;

        if (!poolId) {
          console.warn(
            `[Miners Summary API] Luxor group has no poolId, skipping`,
          );
          continue;
        }

        const authKey = authKeyByPoolId.get(poolId);
        if (!authKey) {
          console.warn(
            `[Miners Summary API] No auth key found for Luxor pool ${poolId}`,
          );
          continue;
        }

        console.log(
          `[Miners Summary API] Fetching Luxor summary for auth key: ${authKey}`,
        );
        const luxorClient = createLuxorClient(authKey);
        const summaryData = await luxorClient.getSummary("BTC", {
          subaccount_names: authKey,
        });

        // Log raw Luxor data to understand format
        console.log(`[Miners Summary API] LUXOR RAW DATA:`, {
          hashrate_5m_type: typeof summaryData.hashrate_5m,
          hashrate_5m_value: summaryData.hashrate_5m,
          hashrate_24h_type: typeof summaryData.hashrate_24h,
          hashrate_24h_value: summaryData.hashrate_24h,
          efficiency_5m_type: typeof summaryData.efficiency_5m,
          efficiency_5m_value: summaryData.efficiency_5m,
          uptime_24h_type: typeof summaryData.uptime_24h,
          uptime_24h_value: summaryData.uptime_24h,
          active_miners: summaryData.active_miners,
        });

        // Use values DIRECTLY from API (Luxor provides efficiency and uptime already calculated)
        // IMPORTANT: Luxor hashrate_24h appears to be in H/s (raw value), keep as-is for now
        // This will be used by card which divides by 10^15 to convert H/s to PH/s
        const luxorHashrate24h = parseFloat(summaryData.hashrate_24h || "0");
        
        // Log raw value to understand the unit
        console.log(
          `[Miners Summary API] LUXOR HASHRATE DEBUG`,
          {
            raw_string: summaryData.hashrate_24h,
            parsed_float: luxorHashrate24h,
            divided_by_1e12: luxorHashrate24h / 1000000000000,
            divided_by_1e15: luxorHashrate24h / 1000000000000000,
          }
        );
        
        const hashrate = luxorHashrate24h;
        const efficiency = summaryData.efficiency_5m || 0; // Use directly, no calculation
        const uptime = summaryData.uptime_24h || 0; // Use directly, no calculation
        
        // revenue_24h is an array of RevenueSummary objects, sum them up
        let revenue = 0;
        if (Array.isArray(summaryData.revenue_24h)) {
          revenue = summaryData.revenue_24h.reduce((sum: number, item: any) => {
            return sum + (item.amount || item.revenue || 0);
          }, 0);
        }
        
        const hashprice = summaryData.hashprice?.[0]?.value
          ? Number(summaryData.hashprice[0].value)
          : 0;
        const activeMiners = summaryData.active_miners || 0;

        console.log(`[Miners Summary API] LUXOR PROCESSED:`, {
          hashrate,
          efficiency,
          uptime,
          revenue,
          hashprice,
          activeMiners,
        });

        totalHashrate += hashrate;
        totalActiveMiners += activeMiners;
        totalRevenue += revenue;
        if (hashprice > 0) {
          avgHashprice += hashprice;
          hashpriceCount++;
        }
        if (efficiency >= 0) {
          efficiencyValues.push(efficiency);
        }
        if (uptime >= 0) {
          uptimeValues.push(uptime);
        }

        poolStats.luxor.miners += group.miners.length;
        poolStats.luxor.hashrate = hashrate;
        poolStats.luxor.activeWorkers = activeMiners;
        poolStats.luxor.hashprice = hashprice;
        poolStats.luxor.efficiency_5m = efficiency;
        poolStats.luxor.uptime_24h = uptime;

        console.log(
          `[Miners Summary API] Luxor summary - Hashrate: ${hashrate}, Revenue: ${revenue}, Hashprice: ${hashprice}, Efficiency: ${efficiency}, Uptime: ${uptime}`,
        );
      } catch (error) {
        console.error(
          `[Miners Summary API] Error fetching Luxor summary:`,
          error,
        );
      }
    }

    // Fetch from Braiins groups
    for (const group of braiinsGroups) {
      try {
        // Get the poolId from the first miner in the group to look up auth
        const minerWithPool = group.miners[0];
        const poolId = minerWithPool?.poolId;

        if (!poolId) {
          console.warn(
            `[Miners Summary API] Braiins group has no poolId, skipping`,
          );
          continue;
        }

        const authKey = authKeyByPoolId.get(poolId);
        if (!authKey) {
          console.warn(
            `[Miners Summary API] No auth key found for Braiins pool ${poolId}`,
          );
          continue;
        }

        console.log(
          `[Miners Summary API] Fetching Braiins profile for auth key: ${authKey}`,
        );
        const braiinsClient = createBraiinsClient(authKey, userId);
        const profileData = await braiinsClient.getUserProfile();

        // Log raw Braiins data to understand format
        console.log(`[Miners Summary API] BRAIINS RAW DATA:`, {
          hash_rate_unit: profileData.btc?.hash_rate_unit,
          hash_rate_5m: profileData.btc?.hash_rate_5m,
          hash_rate_24h: profileData.btc?.hash_rate_24h,
          hash_rate_24h_type: typeof profileData.btc?.hash_rate_24h,
          ok_workers: profileData.btc?.ok_workers,
          dis_workers: profileData.btc?.dis_workers,
          low_workers: profileData.btc?.low_workers,
          off_workers: profileData.btc?.off_workers,
          shares_5m: profileData.btc?.shares_5m,
          shares_24h: profileData.btc?.shares_24h,
          today_reward: profileData.btc?.today_reward,
        });

        // Use only values directly from API - NO CALCULATIONS
        // IMPORTANT: Braiins API hashrate is in Gh/s (gigahash per second)
        // Convert Gh/s to H/s for consistency with Luxor
        const hashrateInGH = parseFloat(profileData.btc?.hash_rate_24h?.toString() || "0");
        const hashrate = hashrateInGH * 1000000000; // Convert Gh/s to H/s (Ghash * 10^9)
        
        const okWorkers = profileData.btc?.ok_workers || 0;
        const todayReward = parseFloat(profileData.btc?.today_reward || "0");

        // NOTE: Braiins API does NOT provide efficiency_5m or uptime_24h
        // These will be marked as 0 (unavailable) for Braiins in the UI

        console.log(`[Miners Summary API] BRAIINS PROCESSED:`, {
          hashrateInGH,
          unit: "Gh/s",
          hashrate,
          hashrate_in_TH: hashrate / 1000000000000,
          okWorkers,
          todayReward,
          efficiency: "NOT_PROVIDED_BY_BRAIINS",
          uptime: "NOT_PROVIDED_BY_BRAIINS",
        });

        totalHashrate += hashrate;
        totalActiveMiners += okWorkers;
        totalRevenue += todayReward;

        poolStats.braiins.miners += group.miners.length;
        poolStats.braiins.hashrate = hashrate;
        poolStats.braiins.activeWorkers = okWorkers;
        poolStats.braiins.efficiency_5m = 0; // Not available from Braiins API
        poolStats.braiins.uptime_24h = 0; // Not available from Braiins API
        poolStats.braiins.hashprice = 0; // Braiins doesn't provide hashprice

        console.log(
          `[Miners Summary API] Braiins profile - Hashrate: ${hashrate} H/s (from ${hashrateInGH} Gh/s), Workers: ${okWorkers}, Revenue: ${todayReward}`,
        );
      } catch (error) {
        console.error(
          `[Miners Summary API] Error fetching Braiins profile:`,
          error,
        );
      }
    }

    const aggHashprice =
      hashpriceCount > 0 ? parseFloat((avgHashprice / hashpriceCount).toFixed(8)) : 0;
    const avgEfficiency =
      efficiencyValues.length > 0
        ? parseFloat(
            (efficiencyValues.reduce((a, b) => a + b, 0) / efficiencyValues.length).toFixed(4),
          )
        : 0;
    const avgUptime =
      uptimeValues.length > 0
        ? parseFloat(
            (uptimeValues.reduce((a, b) => a + b, 0) / uptimeValues.length).toFixed(4),
          )
        : 0;

    console.log(`[Miners Summary API] Final Pool Stats:`, poolStats);
    console.log(`[Miners Summary API] Global Aggregates:`, {
      totalHashrate,
      totalActiveMiners,
      totalRevenue,
      aggHashprice,
      avgEfficiency,
      avgUptime,
    });

    return NextResponse.json({
      success: true,
      data: {
        totalHashrate: parseFloat(totalHashrate.toFixed(2)),
        activeMiners: totalActiveMiners,
        totalRevenue: parseFloat(totalRevenue.toFixed(8)),
        hashprice: aggHashprice,
        efficiency_5m: avgEfficiency,
        uptime_24h: avgUptime,
        pools: {
          luxor: {
            miners: poolStats.luxor.miners,
            hashrate: parseFloat(poolStats.luxor.hashrate.toFixed(2)),
            activeWorkers: poolStats.luxor.activeWorkers,
            hashprice: poolStats.luxor.hashprice,
            efficiency_5m: poolStats.luxor.efficiency_5m,
            uptime_24h: poolStats.luxor.uptime_24h,
          },
          braiins: {
            miners: poolStats.braiins.miners,
            hashrate: parseFloat(poolStats.braiins.hashrate.toFixed(2)),
            activeWorkers: poolStats.braiins.activeWorkers,
            hashprice: poolStats.braiins.hashprice,
            efficiency_5m: poolStats.braiins.efficiency_5m,
            uptime_24h: poolStats.braiins.uptime_24h,
          },
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Handle LuxorError specifically
    if (error instanceof LuxorError) {
      console.error(
        `[Miners Summary API] Luxor API error (${error.statusCode}): ${error.message}`,
      );
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          details: error.errorDetails,
        },
        { status: error.statusCode },
      );
    }

    console.error("[Miners Summary API] Error fetching summary:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch summary",
      },
      { status: 500 },
    );
  }
}
