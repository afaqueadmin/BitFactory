import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient } from "@/lib/luxor";
import { prisma } from "@/lib/prisma";

interface HashpricePoint {
  date: string;
  timestamp: number;
  hashprice: number;
  revenue: number;
  hashrate: number;
}

/**
 * GET /api/hashprice-history?days=30
 * Fetches pool-wide historical hashprice data by combining:
 * - /pool/revenue/BTC (pool daily earnings from 'higgs' main account)
 * - /pool/hashrate-efficiency/BTC (pool daily hashrate from 'higgs' main account)
 * Calculates: hashprice = daily_revenue / daily_hashrate
 *
 * Returns the same pool-wide hashprice for all users (using 'higgs' subaccount)
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
      console.error(
        "[Hashprice History API] Token verification failed:",
        error,
      );
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get days parameter from query (default to 30 days)
    const daysParam = request.nextUrl.searchParams.get("days");
    const days = parseInt(daysParam || "30", 10);

    // Luxor API has ~45 days of historical data maximum
    if (isNaN(days) || days < 1 || days > 45) {
      return NextResponse.json(
        { error: "Days must be between 1 and 45 (Luxor API limit)" },
        { status: 400 },
      );
    }

    console.log(
      `[Hashprice History API] Fetching ${days} days of pool-wide hashprice data for user ${userId}`,
    );

    // Get user's subaccount for authentication (or use 'higgs' for admin)
    // Note: We need a valid subaccount to authenticate, but we'll query pool-wide data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { luxorSubaccountName: true, role: true },
    });

    let subaccountForAuth: string;
    if (user?.role === "ADMIN") {
      subaccountForAuth = "higgs"; // Use main/admin subaccount for auth
    } else if (user?.luxorSubaccountName) {
      subaccountForAuth = user.luxorSubaccountName;
    } else {
      // Fallback to 'higgs' if user has no subaccount configured
      subaccountForAuth = "higgs";
    }

    console.log(
      `[Hashprice History API] Using subaccount '${subaccountForAuth}' for authentication`,
    );

    // Create Luxor client with valid subaccount for authentication
    const luxorClient = createLuxorClient(subaccountForAuth);

    // Format dates as YYYY-MM-DD for Luxor API
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    // Keep date extraction stable across Luxor timestamps without timezone shifts.
    const extractDateKey = (value?: string | null): string | null => {
      if (!value) return null;
      if (value.includes("T")) {
        return value.split("T")[0] || null;
      }
      if (value.length >= 10) {
        return value.slice(0, 10);
      }
      return null;
    };

    const getWindowBounds = (rangeDays: number) => {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 1);
      endDate.setHours(0, 0, 0, 0);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - (rangeDays - 1));
      return {
        startDate,
        endDate,
        startKey: formatDate(startDate),
        endKey: formatDate(endDate),
      };
    };

    const filterByWindow = (data: HashpricePoint[], rangeDays: number) => {
      const { startKey, endKey } = getWindowBounds(rangeDays);
      return data
        .filter((point) => point.date >= startKey && point.date <= endKey)
        .sort((a, b) => a.timestamp - b.timestamp);
    };

    // Fetch helper with consistent date formatting and merge logic.
    const fetchHashpriceRange = async (
      rangeDays: number,
    ): Promise<HashpricePoint[]> => {
      const { startDate, endDate, startKey, endKey } =
        getWindowBounds(rangeDays);

      console.log(
        `[Hashprice History API] Fetching pool-wide data from ${startKey} to ${endKey} (${rangeDays}d window)`,
      );

      const revenueResponse = await luxorClient.getRevenue("BTC", {
        subaccount_names: "higgs",
        start_date: formatDate(startDate),
        end_date: formatDate(endDate),
      });

      const hashrateResponse = await luxorClient.getHashrateEfficiency("BTC", {
        subaccount_names: "higgs",
        start_date: formatDate(startDate),
        end_date: formatDate(endDate),
        tick_size: "1d",
        page_size: 100,
        page_number: 1,
      });

      console.log(`[Hashprice History API] ===== PERIOD DEBUG =====`);
      console.log(`[Hashprice History API] Requested days: ${rangeDays}`);
      console.log(
        `[Hashprice History API] Date range: ${startKey} to ${endKey}`,
      );
      console.log(
        `[Hashprice History API] Revenue records returned: ${revenueResponse.revenue?.length || 0}`,
      );
      console.log(
        `[Hashprice History API] Hashrate records returned: ${hashrateResponse.hashrate_efficiency?.length || 0}`,
      );
      console.log(
        `[Hashprice History API] Hashrate pagination: page ${hashrateResponse.pagination?.page_number}, size ${hashrateResponse.pagination?.page_size}, total items: ${hashrateResponse.pagination?.item_count}`,
      );

      const hashrateByDate: Record<string, number> = {};
      if (
        hashrateResponse.hashrate_efficiency &&
        Array.isArray(hashrateResponse.hashrate_efficiency)
      ) {
        for (const point of hashrateResponse.hashrate_efficiency) {
          const date = extractDateKey(point.date_time);
          if (date && point.hashrate) {
            const hashrate = parseFloat(String(point.hashrate));
            hashrateByDate[date] = hashrate;
          }
        }
      }

      const hashpriceData: HashpricePoint[] = [];
      if (revenueResponse.revenue && Array.isArray(revenueResponse.revenue)) {
        for (const item of revenueResponse.revenue) {
          if (item && item.date_time) {
            const dateStr = extractDateKey(item.date_time);
            if (!dateStr) continue;
            const revenue = item.revenue?.revenue || 0;
            const hashrateRaw = hashrateByDate[dateStr] || 0;

            // Hashrate from API is in H/s, but hashprice is BTC/PH/s/day.
            const hashratePHs = hashrateRaw / 1e15;
            if (hashratePHs > 0) {
              const hashprice = revenue / hashratePHs;
              hashpriceData.push({
                date: dateStr,
                timestamp: new Date(item.date_time).getTime(),
                hashprice: isFinite(hashprice) ? hashprice : 0,
                revenue,
                hashrate: hashrateRaw,
              });
            }
          }
        }
      }

      hashpriceData.sort((a, b) => a.timestamp - b.timestamp);
      return hashpriceData;
    };

    let hashpriceData = await fetchHashpriceRange(days);
    hashpriceData = filterByWindow(hashpriceData, days);

    // Fallback: short windows may have delayed Luxor daily points.
    if (hashpriceData.length < Math.min(days, 2) && days < 45) {
      console.log(
        `[Hashprice History API] Sparse data in ${days}d window (${hashpriceData.length} points). Retrying with 45d fallback window.`,
      );
      const fallback = await fetchHashpriceRange(45);
      const fallbackWindow = filterByWindow(fallback, days);
      hashpriceData =
        fallbackWindow.length > 0
          ? fallbackWindow
          : fallback.slice(-Math.max(days, 2));
    }

    console.log(`[Hashprice History API] ===== FINAL RESULTS =====`);
    console.log(
      `[Hashprice History API] Calculated ${hashpriceData.length} hashprice points`,
    );

    if (hashpriceData.length > 0) {
      const firstDate = new Date(hashpriceData[0].timestamp)
        .toISOString()
        .split("T")[0];
      const lastDate = new Date(
        hashpriceData[hashpriceData.length - 1].timestamp,
      )
        .toISOString()
        .split("T")[0];
      console.log(
        `[Hashprice History API] Date range in results: ${firstDate} to ${lastDate}`,
      );
      console.log(
        `[Hashprice History API] Actual period covered: ${hashpriceData.length} days`,
      );
    }

    // Calculate statistics
    const current =
      hashpriceData.length > 0
        ? hashpriceData[hashpriceData.length - 1].hashprice
        : 0;
    const high =
      hashpriceData.length > 0
        ? Math.max(...hashpriceData.map((d) => d.hashprice))
        : 0;
    const low =
      hashpriceData.length > 0
        ? Math.min(...hashpriceData.map((d) => d.hashprice))
        : 0;

    return NextResponse.json(
      {
        success: true,
        data: hashpriceData,
        statistics: {
          current,
          high,
          low,
          daysReturned: hashpriceData.length,
          currency: "BTC",
          unit: "BTC/PH/s/Day",
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Hashprice History API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch hashprice history",
      },
      { status: 500 },
    );
  }
}
