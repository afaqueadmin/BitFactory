import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { WorkersResponse, SummaryResponse } from "@/lib/luxor";
import { BraiinsClient } from "@/lib/braiins";

interface PoolData {
  workers: {
    activeWorkers: number;
    inactiveWorkers: number;
    totalWorkers: number;
  };
  hashrate_5m: number; // TH/s (5 minute average)
  hashrate_24h: number; // TH/s (24 hour average)
  uptime_24h: number; // percentage (0-100)
  minedRevenue: number; // BTC
}

interface DashboardStats {
  // Database-backed stats
  miners: {
    active: number;
    inactive: number;
    actionRequired: number;
    poolBreakdown?: {
      luxor?: {
        active: number;
        inactive: number;
        actionRequired: number;
        dbCount: number;
      };
      braiins?: {
        active: number;
        inactive: number;
        actionRequired: number;
        dbCount: number;
      };
    };
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
  luxor: PoolData & {
    poolAccounts: {
      total: number;
      active: number;
      inactive: number;
    };
    power: {
      totalPower: number; // kW from miners
      availablePower: number; // kW from spaces
    };
  };
  // Braiins-backed stats (single-user API, no pool accounts)
  braiins?: PoolData & {
    power: {
      totalPower: number; // kW from miners
      availablePower: number; // kW from spaces
    };
  };
  // Combined stats (aggregated from all pools)
  combined?: PoolData & {
    poolAccounts?: {
      total: number;
      active: number;
      inactive: number;
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
    braiinsMinedRevenue?: number; // BTC from Braiins
    combinedMinedRevenue?: number; // Combined BTC from all pools
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
        `[Admin Dashboard] Accessible subaccounts from Luxor (${subaccountNames.length} total):`,
        subaccountNames,
      );
      return subaccountNames;
    }

    console.log(
      "[Admin Dashboard] No subaccounts found in Luxor API response, falling back to database",
    );

    // FALLBACK: Get subaccounts from database if Luxor API returns empty
    try {
      const usersWithSubaccounts = await prisma.user.findMany({
        where: {
          luxorSubaccountName: {
            not: null,
          },
        },
        select: {
          luxorSubaccountName: true,
        },
      });

      const dbSubaccountNames = usersWithSubaccounts
        .map((u) => u.luxorSubaccountName)
        .filter((name): name is string => name !== null);

      console.log(
        `[Admin Dashboard] Fallback: Found ${dbSubaccountNames.length} subaccounts in database:`,
        dbSubaccountNames,
      );
      return dbSubaccountNames;
    } catch (dbError) {
      console.error(
        "[Admin Dashboard] Error fetching subaccounts from database:",
        dbError,
      );
      return [];
    }
  } catch (error) {
    console.error(
      "[Admin Dashboard] Error fetching subaccounts from Luxor API:",
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
      const activeSubaccounts = subaccounts.filter(
        ({ name }) => !name.includes("_test"),
      ).length;
      return {
        total: totalSubaccounts,
        active: activeSubaccounts, // Will be refined by workers fetch
        inactive: totalSubaccounts - activeSubaccounts,
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
    url.searchParams.set("page_number", "1");
    url.searchParams.set("page_size", "1000");
    url.searchParams.set("site_id", process.env.LUXOR_FIXED_SITE_ID || "");

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
 * Helper: Fetch total revenue from Luxor across all subaccounts
 */
async function fetchTotalRevenue(
  request: NextRequest,
  subaccountNames: string[],
): Promise<{
  revenue: number;
} | null> {
  if (subaccountNames.length === 0) {
    return {
      revenue: 0,
    };
  }

  try {
    // Use yesterday as end_date because Luxor API rejects dates that are not in the past
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const endDate = new Intl.DateTimeFormat("en-CA").format(yesterday); // 'YYYY-MM-DD' format

    // Build URL with proper query parameters
    const url = new URL("/api/luxor", request.url);
    url.searchParams.set("endpoint", "revenue");
    url.searchParams.set("currency", "BTC");
    url.searchParams.set("start_date", "2025-01-01");
    url.searchParams.set("end_date", endDate);
    url.searchParams.set("site_id", process.env.LUXOR_FIXED_SITE_ID || "");

    const luxorRequest = new NextRequest(url, {
      method: "GET",
      headers: request.headers,
    });

    const response = await fetch(luxorRequest);

    if (!response.ok) {
      console.error("[Admin Dashboard] Revenue fetch failed:", response.status);
      return null;
    }

    const result = await response.json();
    if (result.success && result.data) {
      const data = result.data; /*as WorkersResponse*/
      const revenueArray = data.revenue as Array<{
        date_time: string;
        revenue: { revenue: number };
      }>;
      return {
        revenue: revenueArray.reduce(
          (sum, dailyRevenueItem) => sum + dailyRevenueItem.revenue.revenue,
          0,
        ),
      };
    }
  } catch (error) {
    console.error("[Admin Dashboard] Error fetching workers:", error);
  }
  return null;
}

/**
 * Helper: Fetch summary statistics from Luxor V2 API
 * V2 API: GET /pool/summary/{currency}?subaccount_names=...
 * Returns: subaccount-specific hashrate, uptime, efficiency, hashprice
 */
async function fetchSummary(
  request: NextRequest,
  subaccountNames: string[],
): Promise<{
  hashrate_5m: number;
  hashrate_24h: number;
  uptime_24h: number;
} | null> {
  console.log(
    "[Admin Dashboard] fetchSummary called with subaccountNames:",
    subaccountNames,
  );

  if (subaccountNames.length === 0) {
    console.warn(
      "[Admin Dashboard] No subaccount names provided to fetchSummary",
    );
    return {
      hashrate_5m: 0,
      hashrate_24h: 0,
      uptime_24h: 0,
    };
  }

  try {
    const url = new URL("/api/luxor", request.url);
    url.searchParams.set("endpoint", "summary");
    url.searchParams.set("currency", "BTC");
    url.searchParams.set("subaccount_names", subaccountNames.join(","));

    console.log("[Admin Dashboard] fetchSummary URL:", url.toString());

    const luxorRequest = new NextRequest(url, {
      method: "GET",
      headers: request.headers,
    });

    const response = await fetch(luxorRequest);

    if (!response.ok) {
      console.error("[Admin Dashboard] Summary fetch failed:", response.status);
      return null;
    }

    const result = await response.json();
    console.log(
      "[Admin Dashboard] Summary raw response:",
      JSON.stringify(result.data, null, 2),
    );

    if (result.success && result.data) {
      const data = result.data as SummaryResponse;

      console.log(
        "[Admin Dashboard] Parsed summary - hashrate_5m:",
        data.hashrate_5m,
        "hashrate_24h:",
        data.hashrate_24h,
        "uptime_24h:",
        data.uptime_24h,
      );

      return {
        hashrate_5m: (parseFloat(data.hashrate_5m) || 0) / 1000000000000000, // Convert from H/s to PH/s
        hashrate_24h: (parseFloat(data.hashrate_24h) || 0) / 1000000000000000, // Convert from H/s to PH/s
        uptime_24h: (data.uptime_24h || 0) * 100, // Convert to percentage (0-100)
      };
    }
  } catch (error) {
    console.error("[Admin Dashboard] Error fetching summary:", error);
  }
  return null;
}

/**
 * Helper: Fetch Braiins data for a specific user (identified by authKey from PoolAuth)
 * Braiins API is single-user (one token = one user)
 */
async function fetchBraiinsProfile(
  braiinsApiToken: string,
): Promise<{
  hashrate_5m: number;
  hashrate_24h: number;
  activeWorkers: number;
  inactiveWorkers: number;
  totalWorkers: number;
} | null> {
  try {
    if (!braiinsApiToken) {
      console.warn("[Admin Dashboard] No Braiins API token provided");
      return null;
    }

    const client = new BraiinsClient(braiinsApiToken, "admin-dashboard");
    const profile = await client.getUserProfile();

    if (profile?.btc) {
      const btc = profile.btc;
      const activeWorkers = btc.ok_workers || 0;
      const inactiveWorkers = (btc.off_workers || 0) + (btc.dis_workers || 0) + (btc.low_workers || 0);
      const totalWorkers = activeWorkers + inactiveWorkers;

      return {
        hashrate_5m: (btc.hash_rate_5m || 0) / 1000000, // Braiins returns in Gh/s, convert to PH/s
        hashrate_24h: (btc.hash_rate_24h || 0) / 1000000, // Braiins returns in Gh/s, convert to PH/s
        activeWorkers,
        inactiveWorkers,
        totalWorkers,
      };
    }
  } catch (error) {
    console.error("[Admin Dashboard] Error fetching Braiins profile:", error);
  }
  return null;
}

/**
 * Helper: Fetch Braiins total revenue from daily rewards
 */
async function fetchBraiinsRevenue(
  braiinsApiToken: string,
): Promise<{ revenue: number } | null> {
  try {
    if (!braiinsApiToken) {
      console.warn("[Admin Dashboard] No Braiins API token provided");
      return null;
    }

    const client = new BraiinsClient(braiinsApiToken, "admin-dashboard");
    
    // Fetch last 30 days of rewards
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const fromDate = thirtyDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD
    const toDate = today.toISOString().split('T')[0]; // YYYY-MM-DD

    const rewards = await client.getDailyRewards({
      from: fromDate,
      to: toDate,
    });

    if (rewards?.btc?.daily_rewards) {
      const totalRevenue = rewards.btc.daily_rewards.reduce((sum, day) => {
        const reward = parseFloat(day.total_reward || "0");
        return sum + reward;
      }, 0);

      return { revenue: totalRevenue };
    }
  } catch (error) {
    console.error("[Admin Dashboard] Error fetching Braiins revenue:", error);
  }
  return null;
}

/**
 * Helper: Fetch Luxor miners stats (pool-specific)
 * Compares DB miners assigned to Luxor with actual Luxor API workers
 */
async function fetchLuxorMiners(
  request: NextRequest,
  subaccountNames: string[],
): Promise<{
  active: number;
  inactive: number;
  actionRequired: number;
  dbCount: number;
} | null> {
  try {
    // Step 1: Get Luxor database miners
    const luxorDbMiners = await prisma.miner.count({
      where: {
        poolId: (await prisma.pool.findUnique({
          where: { name: "Luxor" },
          select: { id: true },
        }))?.id,
        status: "AUTO",
        isDeleted: false,
      },
    });

    console.log(`[Admin Dashboard] Luxor DB miners (AUTO): ${luxorDbMiners}`);

    // Step 2: Get Luxor API workers (if subaccounts exist)
    let apiActiveWorkers = 0;
    let apiInactiveWorkers = 0;

    if (subaccountNames.length > 0) {
      const workersData = await fetchAllWorkers(request, subaccountNames);
      if (workersData) {
        apiActiveWorkers = workersData.active;
        apiInactiveWorkers = workersData.inactive;
        console.log(
          `[Admin Dashboard] Luxor API workers - Active: ${apiActiveWorkers}, Inactive: ${apiInactiveWorkers}`,
        );
      }
    } else {
      console.warn("[Admin Dashboard] No Luxor subaccounts found for miners fetch");
    }

    // Step 3: Calculate action required (orphans)
    const actionRequired = Math.max(0, luxorDbMiners - apiActiveWorkers);

    return {
      active: apiActiveWorkers,
      inactive: apiInactiveWorkers,
      actionRequired,
      dbCount: luxorDbMiners,
    };
  } catch (error) {
    console.error("[Admin Dashboard] Error fetching Luxor miners:", error);
    return null;
  }
}

/**
 * Helper: Fetch Braiins miners stats (pool-specific)
 * Gets all Braiins customers, aggregates their worker counts from API
 * Compares with DB miners assigned to Braiins
 */
async function fetchBraiinsMiners(request: NextRequest): Promise<{
  active: number;
  inactive: number;
  actionRequired: number;
  dbCount: number;
} | null> {
  try {
    // Step 1: Get Braiins pool ID
    const braiinsPool = await prisma.pool.findUnique({
      where: { name: "Braiins" },
      select: { id: true },
    });

    if (!braiinsPool) {
      console.log("[Admin Dashboard] Braiins pool not found");
      return null;
    }

    // Step 2: Get Braiins database miners
    const braiinsDbMiners = await prisma.miner.count({
      where: {
        poolId: braiinsPool.id,
        status: "AUTO",
        isDeleted: false,
      },
    });

    console.log(`[Admin Dashboard] Braiins DB miners (AUTO): ${braiinsDbMiners}`);

    // Step 3: Get all Braiins authKeys from PoolAuth
    const braiinsAuthKeys = await prisma.poolAuth.findMany({
      where: { poolId: braiinsPool.id },
      select: { authKey: true },
    });

    console.log(
      `[Admin Dashboard] Found ${braiinsAuthKeys.length} Braiins authKeys`,
    );

    if (braiinsAuthKeys.length === 0) {
      console.log("[Admin Dashboard] No Braiins PoolAuth found");
      return null;
    }

    // Step 4: Aggregate Braiins API data from all authKeys
    let totalActiveWorkers = 0;
    let totalInactiveWorkers = 0;

    for (const { authKey } of braiinsAuthKeys) {
      try {
        const braiinsProfile = await fetchBraiinsProfile(authKey);
        if (braiinsProfile) {
          totalActiveWorkers += braiinsProfile.activeWorkers;
          totalInactiveWorkers += braiinsProfile.inactiveWorkers;
          console.log(
            `[Admin Dashboard] Braiins authKey stats - Active: ${braiinsProfile.activeWorkers}, Inactive: ${braiinsProfile.inactiveWorkers}`,
          );
        }
      } catch (error) {
        console.error(
          `[Admin Dashboard] Error fetching Braiins profile for authKey:`,
          error,
        );
        continue; // Continue with next authKey on error
      }
    }

    console.log(
      `[Admin Dashboard] Braiins aggregated - Active: ${totalActiveWorkers}, Inactive: ${totalInactiveWorkers}`,
    );

    // Step 5: Calculate action required (orphans)
    const actionRequired = Math.max(0, braiinsDbMiners - totalActiveWorkers);

    return {
      active: totalActiveWorkers,
      inactive: totalInactiveWorkers,
      actionRequired,
      dbCount: braiinsDbMiners,
    };
  } catch (error) {
    console.error("[Admin Dashboard] Error fetching Braiins miners:", error);
    return null;
  }
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

    // Fetch subaccount names once to reuse for all Luxor queries
    let subaccountNames: string[] = [];
    try {
      subaccountNames = await getAllSubaccountNames(request);
    } catch (error) {
      console.error(
        "[Admin Dashboard] Error fetching subaccount names:",
        error,
      );
    }

    // ========== MINERS (Pool-Specific: Luxor + Braiins) ==========

    // Get Luxor miners stats (API + DB)
    let luxorMinersStats: {
      active: number;
      inactive: number;
      actionRequired: number;
      dbCount: number;
    } | null = null;

    try {
      luxorMinersStats = await fetchLuxorMiners(request, subaccountNames);
    } catch (error) {
      console.error("[Admin Dashboard] Error fetching Luxor miners:", error);
      warnings.push("Failed to fetch Luxor miners data");
    }

    // Get Braiins miners stats (API + DB)
    let braiinsMinersStats: {
      active: number;
      inactive: number;
      actionRequired: number;
      dbCount: number;
    } | null = null;

    try {
      braiinsMinersStats = await fetchBraiinsMiners(request);
    } catch (error) {
      console.error("[Admin Dashboard] Error fetching Braiins miners:", error);
      warnings.push("Failed to fetch Braiins miners data");
    }

    // Aggregate miners across all pools
    const activeMinersCount =
      (luxorMinersStats?.active || 0) + (braiinsMinersStats?.active || 0);
    const inactiveMiners =
      (luxorMinersStats?.inactive || 0) + (braiinsMinersStats?.inactive || 0);
    const actionRequiredMiners =
      (luxorMinersStats?.actionRequired || 0) + (braiinsMinersStats?.actionRequired || 0);

    console.log(
      `[Admin Dashboard] Total Miners: ${activeMinersCount} active, ${inactiveMiners} inactive, ${actionRequiredMiners} action required`,
    );

    // ========== DATABASE STATS (Local Infrastructure) ==========

    // Fetch spaces statistics (from local database)
    const freeSpaces = await prisma.space.count({
      where: { status: "AVAILABLE" },
    });
    const usedSpaces = await prisma.space.count({
      where: { status: "OCCUPIED" },
    });

    // Calculate total power - fetch spaces power capacity
    const totalSpacePower = await prisma.space.aggregate({
      _sum: { powerCapacity: true },
    });

    // Calculate power usage: Sum of (hardware.powerUsage * count of AUTO miners using that hardware)
    let usedMinersPower = 0;
    try {
      // Get all hardware with count of AUTO miners using it
      const hardwareWithMinerCounts = await prisma.hardware.findMany({
        where: { isDeleted: false },
        select: {
          id: true,
          powerUsage: true,
          miners: {
            where: {
              status: "AUTO",
              isDeleted: false,
            },
            select: {
              id: true,
            },
          },
        },
      });

      // Calculate total power: sum of (powerUsage * number of AUTO miners)
      usedMinersPower = Number(
        hardwareWithMinerCounts
          .reduce((total, hw) => {
            const minerCount = hw.miners.length;
            const powerForThisHardware = hw.powerUsage * minerCount;
            return total + powerForThisHardware;
          }, 0)
          .toFixed(2),
      );

      console.log(
        `[Admin Dashboard] Total power from AUTO miners: ${usedMinersPower} kW (from ${hardwareWithMinerCounts.length} hardware types)`,
      );
    } catch (error) {
      console.error(
        "[Admin Dashboard] Error calculating power from miners:",
        error,
      );
    }

    // Fetch customers (users with role CLIENT) statistics
    const totalCustomers = await prisma.user.findMany({
      where: {
        role: "CLIENT",
        isDeleted: false,
        NOT: {
          luxorSubaccountName: {
            contains: "_test",
          },
        },
      },
      include: {
        miners: true,
      },
    });

    // Fetch customer balance information
    const totalCustomerBalance = await prisma.costPayment.aggregate({
      _sum: {
        amount: true,
      },
    });

    // Calculate monthly revenue from cost payments
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const monthlyRevenue = await prisma.costPayment.aggregate({
      where: {
        type: { in: ["ELECTRICITY_CHARGES", "ADJUSTMENT"] },
        createdAt: { gte: thirtyDaysAgo },
      },
      _sum: { amount: true },
    });

    // ========== LUXOR STATS (Mining Pool) ==========

    const totalPower = Number(
      (totalSpacePower._sum.powerCapacity || 0).toFixed(2),
    );

    const luxorStats = {
      poolAccounts: { total: 0, active: 0, inactive: 0 },
      workers: { activeWorkers: 0, inactiveWorkers: 0, totalWorkers: 0 },
      hashrate_5m: 0,
      hashrate_24h: 0,
      uptime_24h: 0,
      minedRevenue: 0,
      power: {
        usedPower: usedMinersPower, // kW from active miners
        totalPower: totalPower, // kW from spaces
        availablePower: Number((totalPower - usedMinersPower).toFixed(2)), // available power
      },
    };

    try {
      // Use the subaccount names already fetched above
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

        // Fetch summary data (includes hashrate, uptime)
        const summaryData = await fetchSummary(request, subaccountNames);
        if (summaryData) {
          luxorStats.hashrate_5m = summaryData.hashrate_5m;
          luxorStats.hashrate_24h = summaryData.hashrate_24h;
          luxorStats.uptime_24h = summaryData.uptime_24h;
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
    const activeCustomerCount = totalCustomers.filter(
      (customer) =>
        customer.miners.filter((miner) => miner.status === "AUTO").length > 0,
    ).length;
    const inactiveCustomerCount = totalCustomers.length - activeCustomerCount;

    const revenueStats = await fetchTotalRevenue(request, subaccountNames);
    console.log("revenueStats:", revenueStats);

    // Add Luxor mined revenue to luxorStats
    if (revenueStats) {
      luxorStats.minedRevenue = revenueStats.revenue;
      console.log(
        `[Admin Dashboard] Luxor minedRevenue: ${revenueStats.revenue}`,
      );
    } else {
      luxorStats.minedRevenue = 0;
    }

    // ========== BRAIINS STATS (Mining Pool - Aggregated across all customers) ==========
    let braiinsStats: (PoolData & {
      minedRevenue: number;
      power: {
        totalPower: number;
        availablePower: number;
      };
    }) | undefined;
    let braiinsRevenueStats: { revenue: number } | null = null;

    try {
      // Get all Braiins PoolAuth records (all customers)
      const braiinsPoolAuths = await prisma.poolAuth.findMany({
        where: {
          pool: {
            name: "Braiins",
          },
        },
        select: {
          authKey: true,
        },
      });

      if (braiinsPoolAuths.length > 0) {
        console.log(
          `[Admin Dashboard] Fetching Braiins data from ${braiinsPoolAuths.length} authKey(s)`,
        );

        let totalActiveWorkers = 0;
        let totalInactiveWorkers = 0;
        let totalHashrate5m = 0;
        let totalHashrate24h = 0;
        let totalRevenue = 0;

        // Aggregate data from all Braiins customers
        for (const { authKey } of braiinsPoolAuths) {
          try {
            // Fetch profile for this Braiins customer
            const braiinsProfile = await fetchBraiinsProfile(authKey);
            if (braiinsProfile) {
              totalActiveWorkers += braiinsProfile.activeWorkers;
              totalInactiveWorkers += braiinsProfile.inactiveWorkers;
              totalHashrate5m += braiinsProfile.hashrate_5m;
              totalHashrate24h += braiinsProfile.hashrate_24h;
              console.log(
                `[Admin Dashboard] Braiins customer stats - Active: ${braiinsProfile.activeWorkers}, Inactive: ${braiinsProfile.inactiveWorkers}`,
              );
            }

            // Fetch revenue for this Braiins customer
            const braiinsRevenue = await fetchBraiinsRevenue(authKey);
            if (braiinsRevenue) {
              totalRevenue += braiinsRevenue.revenue;
            }
          } catch (error) {
            console.error(
              `[Admin Dashboard] Error fetching Braiins data for authKey:`,
              error,
            );
            continue; // Continue with next authKey on error
          }
        }

        if (totalActiveWorkers > 0 || totalInactiveWorkers > 0) {
          braiinsStats = {
            workers: {
              activeWorkers: totalActiveWorkers,
              inactiveWorkers: totalInactiveWorkers,
              totalWorkers: totalActiveWorkers + totalInactiveWorkers,
            },
            hashrate_5m: totalHashrate5m,
            hashrate_24h: totalHashrate24h,
            uptime_24h: 0, // Braiins doesn't provide uptime metric
            minedRevenue: totalRevenue,
            power: {
              totalPower: totalPower,
              availablePower: totalPower,
            },
          };

          braiinsRevenueStats = { revenue: totalRevenue };
          console.log(
            `[Admin Dashboard] Braiins aggregated - Active: ${totalActiveWorkers}, Inactive: ${totalInactiveWorkers}, Revenue: ${totalRevenue}`,
          );
        }
      } else {
        console.log("[Admin Dashboard] No Braiins PoolAuth found");
      }
    } catch (error) {
      console.error("[Admin Dashboard] Error fetching Braiins stats:", error);
      warnings.push("Failed to fetch Braiins statistics");
    }

    // ========== COMBINED STATS (aggregated from all pools) ==========
    let combinedStats: (PoolData & {
      power: {
        totalPower: number;
        availablePower: number;
      };
    }) | undefined;

    if (braiinsStats) {
      combinedStats = {
        workers: {
          activeWorkers: (luxorStats.workers?.activeWorkers || 0) + (braiinsStats.workers?.activeWorkers || 0),
          inactiveWorkers: (luxorStats.workers?.inactiveWorkers || 0) + (braiinsStats.workers?.inactiveWorkers || 0),
          totalWorkers: (luxorStats.workers?.totalWorkers || 0) + (braiinsStats.workers?.totalWorkers || 0),
        },
        hashrate_5m: (luxorStats.hashrate_5m || 0) + (braiinsStats.hashrate_5m || 0),
        hashrate_24h: (luxorStats.hashrate_24h || 0) + (braiinsStats.hashrate_24h || 0),
        uptime_24h: luxorStats.uptime_24h || 0, // Use Luxor uptime (Braiins doesn't provide)
        minedRevenue: (luxorStats.minedRevenue || revenueStats?.revenue || 0) + (braiinsStats.minedRevenue || 0),
        power: {
          totalPower: totalPower,
          availablePower: totalPower,
        },
      };
    }

    const stats: DashboardStats = {
      miners: {
        active: activeMinersCount,
        inactive: inactiveMiners,
        actionRequired: actionRequiredMiners,
        poolBreakdown: {
          luxor: luxorMinersStats
            ? {
                active: luxorMinersStats.active,
                inactive: luxorMinersStats.inactive,
                actionRequired: luxorMinersStats.actionRequired,
                dbCount: luxorMinersStats.dbCount,
              }
            : undefined,
          braiins: braiinsMinersStats
            ? {
                active: braiinsMinersStats.active,
                inactive: braiinsMinersStats.inactive,
                actionRequired: braiinsMinersStats.actionRequired,
                dbCount: braiinsMinersStats.dbCount,
              }
            : undefined,
        },
      },
      spaces: {
        free: freeSpaces,
        used: usedSpaces,
      },
      customers: {
        total: totalCustomers.length,
        active: activeCustomerCount,
        inactive: inactiveCustomerCount,
      },
      luxor: luxorStats,
      braiins: braiinsStats,
      combined: combinedStats,
      financial: {
        totalCustomerBalance: totalCustomerBalance._sum.amount || 0,
        monthlyRevenue: monthlyRevenue._sum.amount
          ? monthlyRevenue._sum.amount * -1
          : 0, // Multiply by -1 to show revenue as positive
        totalMinedRevenue: revenueStats?.revenue || 0,
        braiinsMinedRevenue: braiinsRevenueStats?.revenue || 0,
        combinedMinedRevenue: combinedStats
          ? combinedStats.minedRevenue
          : revenueStats?.revenue || 0,
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
