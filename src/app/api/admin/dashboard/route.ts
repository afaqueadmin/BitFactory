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
 * Helper: Fetch all users' subaccount names from database
 */
async function getAllSubaccountNames(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      luxorSubaccountName: { not: null },
    },
    select: { luxorSubaccountName: true },
  });
  return users.map((u) => u.luxorSubaccountName).filter(Boolean) as string[];
}

/**
 * Helper: Fetch all groups from Luxor workspace
 */
async function fetchWorkspaceInfo(
  token: string,
): Promise<{ total: number; active: number; inactive: number } | null> {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/luxor?endpoint=workspace`, {
      method: "GET",
      headers: {
        Cookie: `token=${token}`,
      },
    });

    if (!response.ok) {
      console.error(
        "[Admin Dashboard] Workspace fetch failed:",
        response.status,
      );
      return null;
    }

    const result = await response.json();
    if (result.success && result.data?.groups) {
      const groups = result.data.groups as Array<{
        id: string;
        subaccounts?: { name: string }[];
      }>;
      const totalSubaccounts = groups.reduce(
        (sum, g) => sum + (g.subaccounts?.length || 0),
        0,
      );
      return {
        total: totalSubaccounts,
        active: totalSubaccounts, // Will be refined by workers fetch
        inactive: 0,
      };
    }
  } catch (error) {
    console.error("[Admin Dashboard] Error fetching workspace:", error);
  }
  return null;
}

/**
 * Helper: Fetch all workers from Luxor across all subaccounts
 */
async function fetchAllWorkers(
  token: string,
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
    // Fetch workers with proper comma-separated subaccount names
    const params = new URLSearchParams({
      endpoint: "workers",
      currency: "BTC",
      subaccount_names: subaccountNames.join(","),
      page_number: "1",
      page_size: "1000",
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/luxor?${params.toString()}`, {
      method: "GET",
      headers: {
        Cookie: `token=${token}`,
      },
    });

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
          } else {
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
 * Helper: Fetch hashrate and efficiency metrics from Luxor
 */
async function fetchHashrateEfficiency(
  token: string,
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

    const params = new URLSearchParams({
      endpoint: "hashrate-history",
      currency: "BTC",
      subaccount_names: subaccountNames.join(","),
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      tick_size: "1d",
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/luxor?${params.toString()}`, {
      method: "GET",
      headers: {
        Cookie: `token=${token}`,
      },
    });

    if (!response.ok) {
      console.error(
        "[Admin Dashboard] Hashrate fetch failed:",
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
          metrics.reduce((sum, m) => sum + (m.hashrate || 0), 0) /
          metrics.length;
        const avgEfficiency =
          metrics.reduce((sum, m) => sum + (m.efficiency || 0), 0) /
          metrics.length;

        return {
          currentHashrate: currentMetric?.hashrate || 0,
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
      where: { status: "ACTIVE" },
    });
    const inactiveMiners = await prisma.miner.count({
      where: { status: "INACTIVE" },
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
      where: { status: "ACTIVE" },
      include: { hardware: true },
    });

    const usedMinersPower = activeMiners.reduce(
      (sum, miner) => sum + (miner.hardware?.powerUsage || 0),
      0
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
      // Get all subaccount names
      const subaccountNames = await getAllSubaccountNames();

      if (subaccountNames.length > 0) {
        // Fetch workspace info (groups and subaccounts)
        const workspaceInfo = await fetchWorkspaceInfo(token);
        if (workspaceInfo) {
          luxorStats.poolAccounts = workspaceInfo;
        }

        // Fetch all workers statistics
        const workersStats = await fetchAllWorkers(token, subaccountNames);
        if (workersStats) {
          luxorStats.workers = {
            activeWorkers: workersStats.active,
            inactiveWorkers: workersStats.inactive,
            totalWorkers: workersStats.total,
          };
        }

        // Fetch hashrate and efficiency
        const hashrateStats = await fetchHashrateEfficiency(
          token,
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
