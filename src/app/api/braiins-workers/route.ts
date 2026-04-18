import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { BraiinsClient } from "@/lib/braiins";

interface WorkerStats {
  totalWorkers: number;
  activeWorkers: number;
  inactiveWorkers: number;
  averageHashrate: number; // in TH/s
  lowStatusWorkers: number; // state: "low"
  disabledWorkers: number; // state: "dis"
  offlineWorkers: number; // state: "off"
}

interface TransformedWorker {
  name: string;
  username: string;
  workerName: string;
  state: "ok" | "dis" | "low" | "off";
  hashrate_5m_gh: number;
  hashrate_5m_th: number;
  hashrate_24h_gh: number;
  hashrate_24h_th: number;
  shares_5m: number;
  shares_24h: number;
  last_share: number; // Unix timestamp
  last_share_formatted: string;
}

/**
 * Helper: Format timestamp to readable date
 */
function formatTimestamp(unixTimestamp: number): string {
  try {
    const date = new Date(unixTimestamp * 1000);
    return date.toLocaleString();
  } catch {
    return "N/A";
  }
}

/**
 * Helper: Fetch workers from Braiins API
 */
async function fetchBraiinsWorkers(
  authKey: string,
): Promise<{ workers: TransformedWorker[]; stats: WorkerStats } | null> {
  try {
    if (!authKey) {
      console.warn("[Braiins Workers] No authKey provided");
      return null;
    }

    const client = new BraiinsClient(authKey, "braiins-workers-page");
    const workers = await client.getWorkers();

    if (!workers || workers.length === 0) {
      console.log("[Braiins Workers] No workers found for this customer");
      return {
        workers: [],
        stats: {
          totalWorkers: 0,
          activeWorkers: 0,
          inactiveWorkers: 0,
          averageHashrate: 0,
          lowStatusWorkers: 0,
          disabledWorkers: 0,
          offlineWorkers: 0,
        },
      };
    }

    // Transform workers to our format
    const transformedWorkers: TransformedWorker[] = workers.map((worker) => {
      // Extract username and worker name from the full name
      const parts = worker.name.split(".");
      const username = parts[0] || "unknown";
      const workerName = parts.slice(1).join(".") || worker.name;

      return {
        name: worker.name,
        username,
        workerName,
        state: worker.state,
        hashrate_5m_gh: worker.hash_rate_5m,
        hashrate_5m_th: worker.hash_rate_5m / 1000, // Convert Gh/s to TH/s
        hashrate_24h_gh: worker.hash_rate_24h,
        hashrate_24h_th: worker.hash_rate_24h / 1000, // Convert Gh/s to TH/s
        shares_5m: worker.shares_5m,
        shares_24h: worker.shares_24h,
        last_share: worker.last_share,
        last_share_formatted: formatTimestamp(worker.last_share),
      };
    });

    // Calculate statistics
    const activeWorkers = transformedWorkers.filter(
      (w) => w.state === "ok",
    ).length;
    const lowStatusWorkers = transformedWorkers.filter(
      (w) => w.state === "low",
    ).length;
    const disabledWorkers = transformedWorkers.filter(
      (w) => w.state === "dis",
    ).length;
    const offlineWorkers = transformedWorkers.filter(
      (w) => w.state === "off",
    ).length;
    const inactiveWorkers = lowStatusWorkers + disabledWorkers + offlineWorkers;

    // Calculate average hashrate (using 5m) - only active and low status workers
    const activeAndLowWorkers = transformedWorkers.filter(
      (w) => w.state === "ok" || w.state === "low",
    );
    const totalHashrate5m = activeAndLowWorkers.reduce(
      (sum, w) => sum + w.hashrate_5m_th,
      0,
    );
    const averageHashrate =
      activeAndLowWorkers.length > 0
        ? totalHashrate5m / activeAndLowWorkers.length
        : 0;

    const stats: WorkerStats = {
      totalWorkers: transformedWorkers.length,
      activeWorkers,
      inactiveWorkers,
      averageHashrate, // Already in TH/s
      lowStatusWorkers,
      disabledWorkers,
      offlineWorkers,
    };

    console.log(
      `[Braiins Workers] Fetched ${transformedWorkers.length} workers, Active: ${activeWorkers}, Inactive: ${inactiveWorkers}`,
    );

    return {
      workers: transformedWorkers,
      stats,
    };
  } catch (error) {
    console.error("[Braiins Workers] Error fetching workers from API:", error);
    return null;
  }
}

/**
 * GET /api/braiins-workers?poolAuthId=<id>
 *
 * Fetches workers for a selected Braiins customer
 * Admin-only endpoint
 *
 * Query params:
 * - poolAuthId: ID of the PoolAuth record for the customer
 *
 * Returns: Worker list with aggregated statistics
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and check if user is admin
    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("[Braiins Workers] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access Braiins workers" },
        { status: 403 },
      );
    }

    // Get poolAuthId from query params
    const poolAuthId = request.nextUrl.searchParams.get("poolAuthId");

    if (!poolAuthId) {
      return NextResponse.json(
        { error: "poolAuthId query parameter is required" },
        { status: 400 },
      );
    }

    // Get the PoolAuth record
    const poolAuth = await prisma.poolAuth.findUnique({
      where: { id: poolAuthId },
      select: {
        id: true,
        authKey: true,
        userId: true,
        poolId: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        pool: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!poolAuth) {
      return NextResponse.json(
        { error: "PoolAuth record not found" },
        { status: 404 },
      );
    }

    // Verify this is a Braiins pool
    if (poolAuth.pool?.name !== "Braiins") {
      return NextResponse.json(
        { error: "PoolAuth record is not for Braiins pool" },
        { status: 400 },
      );
    }

    // Fetch workers from Braiins API
    const result = await fetchBraiinsWorkers(poolAuth.authKey);

    if (!result) {
      return NextResponse.json(
        { error: "Failed to fetch workers from Braiins API" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        customer: {
          id: poolAuth.userId,
          name: poolAuth.user?.name || "Unknown",
          email: poolAuth.user?.email,
        },
        stats: result.stats,
        workers: result.workers,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Braiins Workers] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch Braiins workers",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
