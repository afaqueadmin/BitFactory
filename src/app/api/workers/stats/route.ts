import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { createLuxorClient, WorkersResponse, LuxorError } from "@/lib/luxor";
import { createBraiinsClient, BraiinsError } from "@/lib/braiins";
import { groupMinersByPool, getLuxorGroups, getBraiinsGroups } from "@/lib/poolAggregation";

interface WorkersStats {
  activeWorkers: number;
  inactiveWorkers: number;
  totalWorkers: number;
  activePoolNames: string[];
  poolBreakdown?: {
    luxor: {
      activeWorkers: number;
      inactiveWorkers: number;
    };
    braiins: {
      activeWorkers: number;
      inactiveWorkers: number;
    };
  };
}

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
      console.error("[Workers Stats API] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    console.log(`[Workers Stats API] Fetching workers for user: ${userId}`);

    // Fetch all miners for this user with pool relationship
    const miners = await prisma.miner.findMany({
      where: { userId },
      include: { pool: { select: { id: true, name: true } } },
    });

    // Determine which pools are active (have at least one miner)
    const activePoolNames: string[] = [];
    if (miners.some(m => m.pool?.name === "Luxor")) activePoolNames.push("Luxor");
    if (miners.some(m => m.pool?.name === "Braiins")) activePoolNames.push("Braiins");

    if (miners.length === 0) {
      console.log(`[Workers Stats API] User ${userId} has no miners configured`);
      return NextResponse.json({
        success: true,
        data: {
          activeWorkers: 0,
          inactiveWorkers: 0,
          totalWorkers: 0,
          activePoolNames: [],
        },
        timestamp: new Date().toISOString(),
      });
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

    // Group miners by pool and poolAuth
    const aggregation = groupMinersByPool(miners);
    const { groups } = aggregation;
    console.log(
      `[Workers Stats API] Grouped ${miners.length} miners into ${groups.length} groups`,
    );

    let totalActiveWorkers = 0;
    let totalInactiveWorkers = 0;
    const luxorStats = { activeWorkers: 0, inactiveWorkers: 0 };
    const braiinsStats = { activeWorkers: 0, inactiveWorkers: 0 };

    // Query Luxor groups
    const luxorGroups = getLuxorGroups(aggregation);
    console.log(`[Workers Stats API] Processing ${luxorGroups.length} Luxor groups`);

    for (const group of luxorGroups) {
      try {
        // Get the poolId from the first miner in the group to look up auth
        const minerWithPool = group.miners[0];
        const poolId = minerWithPool?.poolId;

        if (!poolId) {
          console.warn(
            `[Workers Stats API] Luxor group has no poolId, skipping`,
          );
          continue;
        }

        const authKey = authKeyByPoolId.get(poolId);
        if (!authKey) {
          console.warn(
            `[Workers Stats API] No auth key found for Luxor pool ${poolId}`,
          );
          continue;
        }

        const luxorClient = createLuxorClient(authKey);
        const workersData = await luxorClient.request<WorkersResponse>(
          "/pool/workers/BTC",
          {
            subaccount_names: authKey,
            page_number: 1,
            page_size: 1000,
          },
        );

        const active = workersData.total_active || 0;
        const inactive = workersData.total_inactive || 0;

        console.log(
          `[Workers Stats API] Luxor group ${group.groupId}: ${active} active, ${inactive} inactive`,
        );

        luxorStats.activeWorkers += active;
        luxorStats.inactiveWorkers += inactive;
        totalActiveWorkers += active;
        totalInactiveWorkers += inactive;
      } catch (error) {
        const errorMsg =
          error instanceof LuxorError
            ? `${error.statusCode}: ${error.message}`
            : error instanceof Error
              ? error.message
              : "Unknown error";
        console.error(
          `[Workers Stats API] Error fetching Luxor group ${group.groupId}: ${errorMsg}`,
        );
      }
    }

    // Query Braiins groups
    const braiinsGroups = getBraiinsGroups(aggregation);
    console.log(`[Workers Stats API] Processing ${braiinsGroups.length} Braiins groups`);

    for (const group of braiinsGroups) {
      try {
        // Get the poolId from the first miner in the group to look up auth
        const minerWithPool = group.miners[0];
        const poolId = minerWithPool?.poolId;

        if (!poolId) {
          console.warn(
            `[Workers Stats API] Braiins group has no poolId, skipping`,
          );
          continue;
        }

        const authKey = authKeyByPoolId.get(poolId);
        if (!authKey) {
          console.warn(
            `[Workers Stats API] No auth key found for Braiins pool ${poolId}`,
          );
          continue;
        }

        const braiinsClient = createBraiinsClient(authKey, userId);
        const workers = await braiinsClient.getWorkers();

        // Log all workers returned from Braiins
        console.log(
          `[Workers Stats API] Braiins API returned ${Array.isArray(workers) ? workers.length : 0} workers:`,
        );
        if (Array.isArray(workers)) {
          workers.forEach((w, i) => {
            console.log(
              `  [${i}] ${w.name} - state: ${w.state} (assigned miners: ${group.miners.map((m) => m.name).join(", ")})`,
            );
          });
        }

        // Count active and inactive workers
        let active = 0;
        let inactive = 0;

        if (Array.isArray(workers)) {
          for (const worker of workers) {
            // Braiins uses "state" field with values: ok, dis, low, off
            if (worker.state === "ok") {
              active++;
            } else {
              inactive++;
            }
          }
        }

        console.log(
          `[Workers Stats API] Braiins group ${group.groupId}: ${active} active, ${inactive} inactive`,
        );

        braiinsStats.activeWorkers += active;
        braiinsStats.inactiveWorkers += inactive;
        totalActiveWorkers += active;
        totalInactiveWorkers += inactive;
      } catch (error) {
        const errorMsg =
          error instanceof BraiinsError
            ? `${error.statusCode}: ${error.message}`
            : error instanceof Error
              ? error.message
              : "Unknown error";
        console.error(
          `[Workers Stats API] Error fetching Braiins group ${group.groupId}: ${errorMsg}`,
        );
      }
    }

    const stats: WorkersStats = {
      activeWorkers: totalActiveWorkers,
      inactiveWorkers: totalInactiveWorkers,
      totalWorkers: totalActiveWorkers + totalInactiveWorkers,
      activePoolNames: activePoolNames,
      poolBreakdown: {
        luxor: luxorStats,
        braiins: braiinsStats,
      },
    };

    console.log(
      `[Workers Stats API] Final stats - Active: ${totalActiveWorkers}, Inactive: ${totalInactiveWorkers}, Active Pools: ${activePoolNames.join(", ")}`,
    );

    return NextResponse.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Workers Stats API] Error fetching workers stats:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch workers stats",
      },
      { status: 500 },
    );
  }
}
