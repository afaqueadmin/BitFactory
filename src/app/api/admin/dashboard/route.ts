import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { WorkersResponse, HashrateEfficiencyResponse } from "@/lib/luxor";

interface DashboardStats {
  // Database-backed stats
  miners: {
    active: number;
    inactive: number;
  };
  spaces: {
    free: number;
    used: number;
  };
  customers: {
    total: number;
    active: number;
    inactive: number;
  };
  // Luxor-backed stats
  luxor: {
    poolAccounts: {
      total: number;
      active: number;
      inactive: number;
    };
    workers: {
      activeWorkers: number;
      inactiveWorkers: number;
      totalWorkers: number;
    };
    hashrate: {
      currentHashrate: number; // TH/s
      averageHashrate: number; // TH/s
    };
    efficiency: {
      currentEfficiency: number; // percentage
      averageEfficiency: number; // percentage
    };
    power: {
      totalPower: number; // kW from miners
      availablePower: number; // kW from spaces
    };
  };
  // Financial stats
  financial: {
    totalCustomerBalance: number; // USD
    monthlyRevenue: number; // USD (from cost payments)
    totalMinedRevenue: number; // BTC from Luxor
  };
  // Status
  warnings: string[];
}

/**
 * Helper: Fetch all ACCESSIBLE subaccount names from Luxor API
 * This ensures we only use subaccounts the current user has permission to access
 *
 * Previously: Fetched from database (luxor_subaccount_name field)
 * Problem: Database might have stale/inaccessible subaccounts
 * Solution: Fetch from Luxor API which returns only accessible ones
 *
 * NOTE: This function must be called from within the GET handler to pass the request
 * context properly. Server-side internal fetches with manually set cookies don't work
 * reliably on production.
 */
async function getAllSubaccountNames(request: NextRequest): Promise<string[]> {
  try {
    console.log(
      "[Admin Dashboard] Fetching accessible subaccounts from Luxor API...",
    );

    // Create a new request to /api/luxor that preserves the original request's cookies
    const url = new URL("/api/luxor?endpoint=subaccounts", request.url);
    const luxorRequest = new NextRequest(url, {
      method: "GET",
      headers: request.headers, // Pass original headers including cookies
    });

    const response = await fetch(luxorRequest);

    if (!response.ok) {
      console.error(
        "[Admin Dashboard] Subaccounts fetch failed:",
        response.status,
      );
      return [];
    }

    const result = await response.json();
    console.log(
      "[Admin Dashboard] Luxor subaccounts response:",
      JSON.stringify(result, null, 2),
    );

    if (result.success && result.data?.subaccounts) {
      const subaccounts = result.data.subaccounts as Array<{
        id: number;
        name: string;
      }>;
      const subaccountNames = subaccounts.map((s) => s.name);
      console.log(
        `[Admin Dashboard] Accessible subaccounts (${subaccountNames.length} total):`,
        subaccountNames,
      );
      return subaccountNames;
    }

    console.log("[Admin Dashboard] No subaccounts found in response");
    return [];
  } catch (error) {
    console.error(
      "[Admin Dashboard] Error fetching subaccounts from Luxor:",
      error,
    );
    return [];
  }
}

/**
 * Helper: Fetch all subaccounts from Luxor (V2 API)
 * V2 API: GET /pool/subaccounts?page_number=1&page_size=10
 * Returns all subaccounts across all sites
 */
async function fetchSubaccountStats(
  request: NextRequest,
): Promise<{ total: number; active: number; inactive: number } | null> {
  try {
    const url = new URL("/api/luxor?endpoint=subaccounts", request.url);
    const luxorRequest = new NextRequest(url, {
      method: "GET",
      headers: request.headers,
    });

    const response = await fetch(luxorRequest);

    if (!response.ok) {
      console.error(
        "[Admin Dashboard] Subaccounts fetch failed:",
        response.status,
      );
      return null;
    }

    const result = await response.json();
    if (result.success && result.data?.subaccounts) {
      const subaccounts = result.data.subaccounts as Array<{
        id: number;
        name: string;
      }>;
      const totalSubaccounts = subaccounts.length;
      return {
        total: totalSubaccounts,
        active: totalSubaccounts, // Will be refined by workers fetch
        inactive: 0,
      };
    }
  } catch (error) {
    console.error("[Admin Dashboard] Error fetching subaccounts:", error);
  }
  return null;
}

/**
 * Helper: Fetch all workers from Luxor across all subaccounts
 */
async function fetchAllWorkers(
  request: NextRequest,
  subaccountNames: string[],
): Promise<{
  active: number;
  inactive: number;
  total: number;
  activeHashrate: number;
  inactiveHashrate: number;
} | null> {
  if (subaccountNames.length === 0) {
    return {
      active: 0,
      inactive: 0,
      total: 0,
      activeHashrate: 0,
      inactiveHashrate: 0,
    };
  }

  try {
    // Build URL with proper query parameters
    const url = new URL("/api/luxor", request.url);
    url.searchParams.set("endpoint", "workers");
    url.searchParams.set("currency", "BTC");
    url.searchParams.set("subaccount_names", subaccountNames.join(","));
    url.searchParams.set("page_number", "1");
    url.searchParams.set("page_size", "1000");

    const luxorRequest = new NextRequest(url, {
      method: "GET",
      headers: request.headers,
    });

    const response = await fetch(luxorRequest);

    if (!response.ok) {
      console.error("[Admin Dashboard] Workers fetch failed:", response.status);
      return null;
    }

    const result = await response.json();
    if (result.success && result.data) {
      const data = result.data as WorkersResponse;

      // Calculate total hashrate from workers
      let activeHashrate = 0;
      let inactiveHashrate = 0;

      if (data.workers) {
        data.workers.forEach((worker) => {
          const hashrate = worker.hashrate || 0;
          if (worker.status === "ACTIVE") {
            activeHashrate += hashrate;
          } else if (worker.status === "INACTIVE") {
            inactiveHashrate += hashrate;
          }
        });
      }

      return {
        active: data.total_active || 0,
        inactive: data.total_inactive || 0,
        total: (data.total_active || 0) + (data.total_inactive || 0),
        activeHashrate,
        inactiveHashrate,
      };
    }
  } catch (error) {
    console.error("[Admin Dashboard] Error fetching workers:", error);
  }
  return null;
}

/**
 * Helper: Fetch hashrate and efficiency metrics from Luxor (V2 API)
 * V2 API: GET /pool/hashrate-efficiency/{currency}?subaccount_names=...&start_date=...&tick_size=1d
 */
async function fetchHashrateEfficiency(
  request: NextRequest,
  subaccountNames: string[],
): Promise<{
  currentHashrate: number;
  averageHashrate: number;
  currentEfficiency: number;
  averageEfficiency: number;
} | null> {
  if (subaccountNames.length === 0) {
    return {
      currentHashrate: 0,
      averageHashrate: 0,
      currentEfficiency: 0,
      averageEfficiency: 0,
    };
  }

  try {
    // Fetch last 7 days of data for recent trends
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const url = new URL("/api/luxor", request.url);
    url.searchParams.set("endpoint", "hashrate-efficiency");
    url.searchParams.set("currency", "BTC");
    url.searchParams.set("subaccount_names", subaccountNames.join(","));
    url.searchParams.set("start_date", startDate.toISOString().split("T")[0]);
    url.searchParams.set("end_date", endDate.toISOString().split("T")[0]);
    url.searchParams.set("tick_size", "1d");
    url.searchParams.set("page_number", "1");
    url.searchParams.set("page_size", "1000");

    const luxorRequest = new NextRequest(url, {
      method: "GET",
      headers: request.headers,
    });

    const response = await fetch(luxorRequest);

    if (!response.ok) {
      console.error(
        "[Admin Dashboard] Hashrate efficiency fetch failed:",
        response.status,
      );
      return null;
    }

    const result = await response.json();
    if (result.success && result.data) {
      const data = result.data as HashrateEfficiencyResponse;

      if (data.hashrate_efficiency && data.hashrate_efficiency.length > 0) {
        const metrics = data.hashrate_efficiency;
        const currentMetric = metrics[metrics.length - 1];

        // Calculate averages
        const avgHashrate =
          metrics.reduce((sum, m) => {
            const hashrate =
              typeof m.hashrate === "string"
                ? parseFloat(m.hashrate)
                : m.hashrate || 0;
            return sum + hashrate;
          }, 0) / metrics.length;
        const avgEfficiency =
          metrics.reduce((sum, m) => sum + (m.efficiency || 0), 0) /
          metrics.length;

        // Parse current hashrate (may be string in response)
        const currentHashrate =
          typeof currentMetric?.hashrate === "string"
            ? parseFloat(currentMetric.hashrate)
            : currentMetric?.hashrate || 0;

        return {
          currentHashrate,
          averageHashrate: avgHashrate,
          currentEfficiency: currentMetric?.efficiency || 0,
          averageEfficiency: avgEfficiency,
        };
      }
    }
  } catch (error) {
    console.error(
      "[Admin Dashboard] Error fetching hashrate efficiency:",
      error,
    );
  }
  return null;
}

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
      console.error("[Admin Dashboard] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access dashboard stats" },
        { status: 403 },
      );
    }

    const warnings: string[] = [];

    // ========== DATABASE STATS (Local Infrastructure) ==========

    // Fetch miners statistics (from local database)
    const activeMinersCount = await prisma.miner.count({
      where: { status: "AUTO" },
    });
    const inactiveMiners = await prisma.miner.count({
      where: { status: "DEPLOYMENT_IN_PROGRESS" },
    });

    // Fetch spaces statistics (from local database)
    const freeSpaces = await prisma.space.count({
      where: { status: "AVAILABLE" },
    });
    const usedSpaces = await prisma.space.count({
      where: { status: "OCCUPIED" },
    });

    // Calculate total power - fetch active miners with hardware relation
    const totalSpacePower = await prisma.space.aggregate({
      _sum: { powerCapacity: true },
    });

    const activeMiners = await prisma.miner.findMany({
      where: { status: "AUTO" },
      include: { hardware: true },
    });

    const usedMinersPower = activeMiners.reduce(
      (sum, miner) => sum + (miner.hardware?.powerUsage || 0),
      0,
    );

    // Fetch customers (users with role CLIENT) statistics
    const totalCustomers = await prisma.user.count({
      where: { role: "CLIENT" },
    });

    // Fetch customer balance information
    const customerBalances = await prisma.costPayment.findMany({
      where: {
        userId: {
          in: (
            await prisma.user.findMany({
              where: { role: "CLIENT" },
              select: { id: true },
            })
          ).map((u) => u.id),
        },
      },
      orderBy: { createdAt: "desc" },
      select: { userId: true, amount: true },
    });

    const totalCustomerBalance = customerBalances.reduce(
      (sum, p) => sum + (p.amount || 0),
      0,
    );

    // Calculate monthly revenue from cost payments
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const monthlyRevenue = await prisma.costPayment.aggregate({
      where: {
        type: "PAYMENT",
        createdAt: { gte: thirtyDaysAgo },
      },
      _sum: { amount: true },
    });

    // ========== LUXOR STATS (Mining Pool) ==========

    const luxorStats = {
      poolAccounts: { total: 0, active: 0, inactive: 0 },
      workers: { activeWorkers: 0, inactiveWorkers: 0, totalWorkers: 0 },
      hashrate: { currentHashrate: 0, averageHashrate: 0 },
      efficiency: { currentEfficiency: 0, averageEfficiency: 0 },
      power: {
        totalPower: usedMinersPower, // kW from active miners
        availablePower: totalSpacePower._sum.powerCapacity || 0, // kW from spaces
      },
    };

    try {
      // Get all ACCESSIBLE subaccount names from Luxor
      const subaccountNames = await getAllSubaccountNames(request);

      if (subaccountNames.length > 0) {
        // Fetch subaccount statistics from V2 API
        const subaccountStats = await fetchSubaccountStats(request);
        if (subaccountStats) {
          luxorStats.poolAccounts = subaccountStats;
        }

        // Fetch all workers statistics
        const workersStats = await fetchAllWorkers(request, subaccountNames);
        if (workersStats) {
          luxorStats.workers = {
            activeWorkers: workersStats.active,
            inactiveWorkers: workersStats.inactive,
            totalWorkers: workersStats.total,
          };
        }

        // Fetch hashrate and efficiency
        const hashrateStats = await fetchHashrateEfficiency(
          request,
          subaccountNames,
        );
        if (hashrateStats) {
          luxorStats.hashrate = {
            currentHashrate: hashrateStats.currentHashrate,
            averageHashrate: hashrateStats.averageHashrate,
          };
          luxorStats.efficiency = {
            currentEfficiency: hashrateStats.currentEfficiency,
            averageEfficiency: hashrateStats.averageEfficiency,
          };
        }
      } else {
        warnings.push("No Luxor subaccounts configured for any users");
      }
    } catch (error) {
      console.error("[Admin Dashboard] Error fetching Luxor stats:", error);
      warnings.push(
        "Failed to fetch Luxor statistics - showing database values only",
      );
    }

    // ========== COUNT ACTIVE/INACTIVE CUSTOMERS ==========
    // Active customers: those with active workers on Luxor
    const activeCustomerCount =
      luxorStats.workers.totalWorkers > 0
        ? Math.min(
            totalCustomers,
            Math.ceil(luxorStats.workers.activeWorkers / 2),
          )
        : 0;
    const inactiveCustomerCount = totalCustomers - activeCustomerCount;

    const stats: DashboardStats = {
      miners: {
        active: activeMinersCount,
        inactive: inactiveMiners,
      },
      spaces: {
        free: freeSpaces,
        used: usedSpaces,
      },
      customers: {
        total: totalCustomers,
        active: activeCustomerCount,
        inactive: inactiveCustomerCount,
      },
      luxor: luxorStats,
      financial: {
        totalCustomerBalance,
        monthlyRevenue: monthlyRevenue._sum.amount || 0,
        totalMinedRevenue: 0, // Would need to fetch from Luxor earnings endpoint (not yet available)
      },
      warnings,
    };

    return NextResponse.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Admin Dashboard] Error fetching stats:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch dashboard statistics",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
