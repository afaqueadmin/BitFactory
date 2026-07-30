/**
 * GET /api/franchisee/dashboard
 *
 * Franchisee-facing dashboard stats — scoped to the calling franchisee's
 * own customers. FRANCHISEE role only.
 *
 * Card scope:
 * - Customers (active/inactive), Total Customers: scoped via franchiseeUserFilter
 * - Monthly Revenue (30 days), Total Customer Balance: scoped by customer id
 * - Hashrate (5m/24h), Uptime (24h): intentionally global/unscoped, same as admin
 * - Miners (active/inactive/actionRequired), Total Mined Revenue: scoped —
 *   the Luxor side relies on src/app/api/luxor/route.ts's `workers`/`revenue`
 *   cases, which resolve the franchisee's own subaccount names server-side
 *   (workers) or accept an explicit `subaccount_name` param (revenue); the
 *   Braiins side filters PoolAuth by the franchisee's own customer ids.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { SummaryResponse } from "@/lib/luxor";
import { BraiinsClient } from "@/lib/braiins";
import {
  franchiseeUserFilter,
  franchiseeMinerFilter,
} from "@/lib/franchiseeScope";

interface PoolData {
  hashrate_5m: number;
  hashrate_24h: number;
  uptime_24h: number;
  minedRevenue: number;
}

interface MinerPoolCounts {
  active: number;
  inactive: number;
  actionRequired: number;
}

interface FranchiseeDashboardStats {
  customers: {
    total: number;
    active: number;
    inactive: number;
  };
  miners: MinerPoolCounts & {
    poolBreakdown: {
      luxor: MinerPoolCounts;
      braiins: MinerPoolCounts;
    };
  };
  financial: {
    totalCustomerBalance: number;
    monthlyRevenue: number;
  };
  luxor: PoolData;
  braiins: PoolData;
  combined: PoolData;
  warnings: string[];
}

/**
 * Fetch all accessible Luxor subaccount names. Deliberately unscoped — the
 * hashrate/uptime cards are meant to match what admin sees, not be filtered
 * to the franchisee's own customers.
 */
async function getAllSubaccountNames(request: NextRequest): Promise<string[]> {
  try {
    const url = new URL("/api/luxor?endpoint=subaccounts", request.url);
    const luxorRequest = new NextRequest(url, {
      method: "GET",
      headers: request.headers,
    });

    const response = await fetch(luxorRequest);
    if (!response.ok) {
      return [];
    }

    const result = await response.json();
    if (result.success && result.data?.subaccounts) {
      const subaccounts = result.data.subaccounts as Array<{
        id: number;
        name: string;
      }>;
      return subaccounts.map((s) => s.name);
    }

    // Fallback: all subaccounts known in the DB (also unscoped, matching admin)
    const usersWithSubaccounts = await prisma.user.findMany({
      where: { luxorSubaccountName: { not: null } },
      select: { luxorSubaccountName: true },
    });
    return usersWithSubaccounts
      .map((u) => u.luxorSubaccountName)
      .filter((name): name is string => name !== null);
  } catch (error) {
    console.error("[Franchisee Dashboard] Error fetching subaccounts:", error);
    return [];
  }
}

async function fetchSummary(
  request: NextRequest,
  subaccountNames: string[],
): Promise<{
  hashrate_5m: number;
  hashrate_24h: number;
  uptime_24h: number;
} | null> {
  if (subaccountNames.length === 0) {
    return { hashrate_5m: 0, hashrate_24h: 0, uptime_24h: 0 };
  }

  try {
    const url = new URL("/api/luxor", request.url);
    url.searchParams.set("endpoint", "summary");
    url.searchParams.set("currency", "BTC");
    url.searchParams.set("subaccount_names", subaccountNames.join(","));

    const luxorRequest = new NextRequest(url, {
      method: "GET",
      headers: request.headers,
    });

    const response = await fetch(luxorRequest);
    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    if (result.success && result.data) {
      const data = result.data as SummaryResponse;
      return {
        hashrate_5m: (parseFloat(data.hashrate_5m) || 0) / 1000000000000000,
        hashrate_24h: (parseFloat(data.hashrate_24h) || 0) / 1000000000000000,
        uptime_24h: (data.uptime_24h || 0) * 100,
      };
    }
  } catch (error) {
    console.error("[Franchisee Dashboard] Error fetching summary:", error);
  }
  return null;
}

async function fetchBraiinsProfile(braiinsApiToken: string): Promise<{
  hashrate_5m: number;
  hashrate_24h: number;
  activeWorkers: number;
  inactiveWorkers: number;
} | null> {
  try {
    if (!braiinsApiToken) return null;
    const client = new BraiinsClient(braiinsApiToken, "franchisee-dashboard");
    const profile = await client.getUserProfile();

    if (profile?.btc) {
      const btc = profile.btc;
      return {
        hashrate_5m: (btc.hash_rate_5m || 0) / 1000000,
        hashrate_24h: (btc.hash_rate_24h || 0) / 1000000,
        activeWorkers: btc.ok_workers || 0,
        inactiveWorkers:
          (btc.off_workers || 0) +
          (btc.dis_workers || 0) +
          (btc.low_workers || 0),
      };
    }
  } catch (error) {
    console.error(
      "[Franchisee Dashboard] Error fetching Braiins profile:",
      error,
    );
  }
  return null;
}

/**
 * Fetch Braiins all-time revenue from the user profile endpoint
 * (btc.all_time_reward), matching the admin dashboard's calculation.
 */
async function fetchBraiinsAllTimeRevenue(
  braiinsApiToken: string,
): Promise<{ revenue: number } | null> {
  try {
    if (!braiinsApiToken) return null;
    const client = new BraiinsClient(braiinsApiToken, "franchisee-dashboard");
    const profile = await client.getUserProfile();

    if (profile?.btc) {
      const revenue = parseFloat(profile.btc.all_time_reward || "0");
      return { revenue: Number.isFinite(revenue) ? revenue : 0 };
    }
  } catch (error) {
    console.error(
      "[Franchisee Dashboard] Error fetching Braiins revenue:",
      error,
    );
  }
  return null;
}

/**
 * Scoped Luxor worker counts — the `/api/luxor` proxy resolves the
 * franchisee's own subaccount names server-side (see route.ts's `workers`
 * case), so no subaccount info needs to be passed here at all.
 */
async function fetchScopedWorkers(request: NextRequest): Promise<{
  active: number;
  inactive: number;
} | null> {
  try {
    const url = new URL("/api/luxor", request.url);
    url.searchParams.set("endpoint", "workers");
    url.searchParams.set("currency", "BTC");
    url.searchParams.set("page_number", "1");
    url.searchParams.set("page_size", "1000");

    const luxorRequest = new NextRequest(url, {
      method: "GET",
      headers: request.headers,
    });

    const response = await fetch(luxorRequest);
    if (!response.ok) return null;

    const result = await response.json();
    if (result.success && result.data) {
      return {
        active: result.data.total_active || 0,
        inactive: result.data.total_inactive || 0,
      };
    }
  } catch (error) {
    console.error("[Franchisee Dashboard] Error fetching workers:", error);
  }
  return null;
}

/**
 * Scoped Luxor mined revenue — unlike `workers`/`summary`, the proxy's
 * `revenue` case does not re-derive scoping from the caller's role, so the
 * franchisee's own (already scoped) subaccount names must be supplied
 * explicitly here.
 */
async function fetchScopedRevenue(
  request: NextRequest,
  subaccountNamesCsv: string,
): Promise<{ revenue: number } | null> {
  if (!subaccountNamesCsv) {
    return { revenue: 0 };
  }

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const endDate = new Intl.DateTimeFormat("en-CA").format(yesterday);

    const url = new URL("/api/luxor", request.url);
    url.searchParams.set("endpoint", "revenue");
    url.searchParams.set("currency", "BTC");
    url.searchParams.set("start_date", "2025-01-01");
    url.searchParams.set("end_date", endDate);
    url.searchParams.set("subaccount_name", subaccountNamesCsv);

    const luxorRequest = new NextRequest(url, {
      method: "GET",
      headers: request.headers,
    });

    const response = await fetch(luxorRequest);
    if (!response.ok) return null;

    const result = await response.json();
    if (result.success && result.data) {
      const revenueArray = result.data.revenue as
        | Array<{ revenue: { revenue: number } }>
        | undefined;
      if (!revenueArray) return { revenue: 0 };
      return {
        revenue: revenueArray.reduce(
          (sum, item) => sum + (item.revenue?.revenue || 0),
          0,
        ),
      };
    }
  } catch (error) {
    console.error("[Franchisee Dashboard] Error fetching revenue:", error);
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch (error) {
      console.error("[Franchisee Dashboard] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (decoded.role !== "FRANCHISEE") {
      return NextResponse.json(
        { error: "Only franchisees can access this dashboard" },
        { status: 403 },
      );
    }

    const currentUser = { id: decoded.userId, role: decoded.role };
    const warnings: string[] = [];

    // ========== CUSTOMERS (scoped) ==========
    const totalCustomers = await prisma.user.findMany({
      where: {
        role: "CLIENT",
        isDeleted: false,
        NOT: { luxorSubaccountName: { contains: "_test" } },
        ...franchiseeUserFilter(currentUser),
      },
      include: { miners: true },
    });

    const activeCustomerCount = totalCustomers.filter(
      (customer) =>
        customer.miners.filter((miner) => miner.status === "AUTO").length > 0,
    ).length;
    const inactiveCustomerCount = totalCustomers.length - activeCustomerCount;
    const customerIds = totalCustomers.map((c) => c.id);

    // ========== FINANCIAL (scoped) ==========
    const totalCustomerBalanceAgg = await prisma.costPayment.aggregate({
      where: { userId: { in: customerIds }, isDeleted: false },
      _sum: { amount: true },
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const monthlyRevenueAgg = await prisma.costPayment.aggregate({
      where: {
        userId: { in: customerIds },
        type: { in: ["ELECTRICITY_CHARGES", "ADJUSTMENT"] },
        createdAt: { gte: thirtyDaysAgo },
        isDeleted: false,
      },
      _sum: { amount: true },
    });

    // ========== MINERS + MINED REVENUE (scoped to this franchisee's customers) ==========
    let luxorActive = 0;
    let luxorInactive = 0;
    let luxorActionRequired = 0;
    let luxorRevenue = 0;

    try {
      const luxorPool = await prisma.pool.findUnique({
        where: { name: "Luxor" },
        select: { id: true },
      });

      const luxorDbCount = await prisma.miner.count({
        where: {
          poolId: luxorPool?.id,
          status: "AUTO",
          isDeleted: false,
          ...franchiseeMinerFilter(currentUser),
        },
      });

      const franchiseeSubaccountNames = totalCustomers
        .map((c) => c.luxorSubaccountName)
        .filter((name): name is string => !!name)
        .join(",");

      if (franchiseeSubaccountNames) {
        const workersData = await fetchScopedWorkers(request);
        if (workersData) {
          luxorActive = workersData.active;
          luxorInactive = workersData.inactive;
        }

        const revenueData = await fetchScopedRevenue(
          request,
          franchiseeSubaccountNames,
        );
        if (revenueData) {
          luxorRevenue = revenueData.revenue;
        }
      }

      luxorActionRequired = Math.max(0, luxorDbCount - luxorActive);
    } catch (error) {
      console.error(
        "[Franchisee Dashboard] Error fetching Luxor miners/revenue:",
        error,
      );
      warnings.push("Failed to fetch Luxor miners/revenue data");
    }

    let braiinsActive = 0;
    let braiinsInactive = 0;
    let braiinsActionRequired = 0;
    let braiinsRevenue = 0;

    try {
      const braiinsPool = await prisma.pool.findUnique({
        where: { name: "Braiins" },
        select: { id: true },
      });

      if (braiinsPool) {
        const braiinsDbCount = await prisma.miner.count({
          where: {
            poolId: braiinsPool.id,
            status: "AUTO",
            isDeleted: false,
            ...franchiseeMinerFilter(currentUser),
          },
        });

        const scopedBraiinsAuths = await prisma.poolAuth.findMany({
          where: { poolId: braiinsPool.id, userId: { in: customerIds } },
          select: { authKey: true },
        });

        for (const { authKey } of scopedBraiinsAuths) {
          try {
            const profile = await fetchBraiinsProfile(authKey);
            if (profile) {
              braiinsActive += profile.activeWorkers;
              braiinsInactive += profile.inactiveWorkers;
            }

            const revenue = await fetchBraiinsAllTimeRevenue(authKey);
            if (revenue) {
              braiinsRevenue += revenue.revenue;
            }
          } catch (error) {
            console.error(
              "[Franchisee Dashboard] Error fetching Braiins data for authKey:",
              error,
            );
            continue;
          }
        }

        braiinsActionRequired = Math.max(0, braiinsDbCount - braiinsActive);
      }
    } catch (error) {
      console.error(
        "[Franchisee Dashboard] Error fetching Braiins miners/revenue:",
        error,
      );
      warnings.push("Failed to fetch Braiins miners/revenue data");
    }

    // ========== HASHRATE / UPTIME (global, unscoped — same as admin) ==========
    // Kept separate per pool (not just combined) so the pool-mode toggle can
    // show Luxor-only / Braiins-only / combined, exactly like admin.
    let luxorHashrate5m = 0;
    let luxorHashrate24h = 0;
    let luxorUptime24h = 0;

    try {
      const subaccountNames = await getAllSubaccountNames(request);
      if (subaccountNames.length > 0) {
        const summaryData = await fetchSummary(request, subaccountNames);
        if (summaryData) {
          luxorHashrate5m = summaryData.hashrate_5m;
          luxorHashrate24h = summaryData.hashrate_24h;
          luxorUptime24h = summaryData.uptime_24h;
        }
      } else {
        warnings.push("No Luxor subaccounts configured for any users");
      }
    } catch (error) {
      console.error(
        "[Franchisee Dashboard] Error fetching Luxor stats:",
        error,
      );
      warnings.push("Failed to fetch Luxor statistics");
    }

    let braiinsHashrate5mGlobal = 0;
    let braiinsHashrate24hGlobal = 0;

    try {
      const braiinsPoolAuthsGlobal = await prisma.poolAuth.findMany({
        where: { pool: { name: "Braiins" } },
        select: { authKey: true },
      });

      for (const { authKey } of braiinsPoolAuthsGlobal) {
        try {
          const profile = await fetchBraiinsProfile(authKey);
          if (profile) {
            braiinsHashrate5mGlobal += profile.hashrate_5m;
            braiinsHashrate24hGlobal += profile.hashrate_24h;
          }
        } catch (error) {
          console.error(
            "[Franchisee Dashboard] Error fetching Braiins data for authKey:",
            error,
          );
          continue;
        }
      }
    } catch (error) {
      console.error(
        "[Franchisee Dashboard] Error fetching Braiins stats:",
        error,
      );
      warnings.push("Failed to fetch Braiins statistics");
    }

    const stats: FranchiseeDashboardStats = {
      customers: {
        total: totalCustomers.length,
        active: activeCustomerCount,
        inactive: inactiveCustomerCount,
      },
      miners: {
        active: luxorActive + braiinsActive,
        inactive: luxorInactive + braiinsInactive,
        actionRequired: luxorActionRequired + braiinsActionRequired,
        poolBreakdown: {
          luxor: {
            active: luxorActive,
            inactive: luxorInactive,
            actionRequired: luxorActionRequired,
          },
          braiins: {
            active: braiinsActive,
            inactive: braiinsInactive,
            actionRequired: braiinsActionRequired,
          },
        },
      },
      financial: {
        totalCustomerBalance: totalCustomerBalanceAgg._sum.amount || 0,
        monthlyRevenue: monthlyRevenueAgg._sum.amount || 0,
      },
      luxor: {
        hashrate_5m: luxorHashrate5m,
        hashrate_24h: luxorHashrate24h,
        uptime_24h: luxorUptime24h,
        minedRevenue: luxorRevenue,
      },
      braiins: {
        hashrate_5m: braiinsHashrate5mGlobal,
        hashrate_24h: braiinsHashrate24hGlobal,
        uptime_24h: 0, // Braiins doesn't provide an uptime metric, matching admin
        minedRevenue: braiinsRevenue,
      },
      combined: {
        hashrate_5m: luxorHashrate5m + braiinsHashrate5mGlobal,
        hashrate_24h: luxorHashrate24h + braiinsHashrate24hGlobal,
        uptime_24h: luxorUptime24h, // Luxor-only, matching admin's combined uptime
        minedRevenue: luxorRevenue + braiinsRevenue,
      },
      warnings,
    };

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error("[Franchisee Dashboard] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch dashboard statistics" },
      { status: 500 },
    );
  }
}
