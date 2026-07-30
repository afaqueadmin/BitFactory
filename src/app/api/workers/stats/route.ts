import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { createLuxorClient, WorkersResponse, LuxorError } from "@/lib/luxor";
import { createBraiinsClient, BraiinsError } from "@/lib/braiins";

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

    // Get PoolAuth entries for this user (contains API keys). Which pools
    // are active is determined directly from PoolAuth, not from
    // Miner.poolId - a Braiins/Luxor account is authenticated independently
    // of whether any Miner row happens to be tagged with that pool.
    const poolAuths = await prisma.poolAuth.findMany({
      where: { userId },
      include: { pool: { select: { id: true, name: true } } },
    });

    const luxorAuth = poolAuths.find((auth) =>
      auth.pool.name.toLowerCase().includes("luxor"),
    );
    const braiinsAuth = poolAuths.find((auth) =>
      auth.pool.name.toLowerCase().includes("braiins"),
    );

    const activePoolNames: string[] = [];
    if (luxorAuth) activePoolNames.push("Luxor");
    if (braiinsAuth) activePoolNames.push("Braiins");

    if (poolAuths.length === 0) {
      console.log(
        `[Workers Stats API] User ${userId} has no pool accounts configured`,
      );
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

    let totalActiveWorkers = 0;
    let totalInactiveWorkers = 0;
    const luxorStats = { activeWorkers: 0, inactiveWorkers: 0 };
    const braiinsStats = { activeWorkers: 0, inactiveWorkers: 0 };

    // Query Luxor
    if (luxorAuth) {
      try {
        const authKey = luxorAuth.authKey;
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
          `[Workers Stats API] Luxor: ${active} active, ${inactive} inactive`,
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
          `[Workers Stats API] Error fetching Luxor workers: ${errorMsg}`,
        );
      }
    }

    // Query Braiins
    if (braiinsAuth) {
      try {
        const authKey = braiinsAuth.authKey;
        const braiinsClient = createBraiinsClient(authKey, userId);
        const workers = await braiinsClient.getWorkers();

        // Log all workers returned from Braiins
        console.log(
          `[Workers Stats API] Braiins API returned ${Array.isArray(workers) ? workers.length : 0} workers:`,
        );
        if (Array.isArray(workers)) {
          workers.forEach((w, i) => {
            console.log(`  [${i}] ${w.name} - state: ${w.state}`);
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
          `[Workers Stats API] Braiins: ${active} active, ${inactive} inactive`,
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
          `[Workers Stats API] Error fetching Braiins workers: ${errorMsg}`,
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
