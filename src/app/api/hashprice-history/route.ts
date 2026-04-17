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
      `[Hashprice History API] Fetching ${days} days of hashprice data for user ${userId}`,
    );

    // Step 1: Get user's miners with pool relationships
    const miners = await prisma.miner.findMany({
      where: { userId },
      include: { pool: { select: { id: true, name: true } } },
    });

    if (!miners || miners.length === 0) {
      console.log(`[Hashprice History API] User ${userId} has no miners`);
      return NextResponse.json(
        {
          data: [],
          message: "No miners assigned",
        },
        { status: 200 },
      );
    }

    // Step 2: Check if user has miners on Luxor pool
    const hasLuxorMiners = miners.some(m => m.pool?.name === "Luxor");
    if (!hasLuxorMiners) {
      console.log(
        `[Hashprice History API] User ${userId} has no miners on Luxor pool`,
      );
      return NextResponse.json(
        {
          data: [],
          message: "No miners on Luxor pool",
        },
        { status: 200 },
      );
    }

    // Step 3: Get PoolAuth for Luxor pool (contains subaccount name)
    const luxorPool = await prisma.pool.findUnique({
      where: { name: "Luxor" },
    });

    if (!luxorPool) {
      console.log(`[Hashprice History API] Luxor pool not found in database`);
      return NextResponse.json(
        { error: "Luxor pool not configured" },
        { status: 500 },
      );
    }

    const poolAuth = await prisma.poolAuth.findUnique({
      where: {
        poolId_userId: {
          poolId: luxorPool.id,
          userId,
        },
      },
    });

    if (!poolAuth) {
      console.log(
        `[Hashprice History API] No PoolAuth found for user ${userId} on Luxor pool`,
      );
      return NextResponse.json(
        {
          data: [],
          message: "No Luxor pool credentials configured",
        },
        { status: 200 },
      );
    }

    // Step 4: Get subaccount name from PoolAuth.authKey
    const subaccountName = poolAuth.authKey;
    console.log(
      `[Hashprice History API] Using subaccount '${subaccountName}' for user ${userId}`,
    );

    // Create Luxor client for logging purposes
    const luxorClient = createLuxorClient(subaccountName);

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

    const getAPIRequestBounds = () => {
      // Request from a fixed early date to today to capture all available data
      // (Luxor hashrate data is sparse, so we need to request broadly)
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 1);
      endDate.setHours(0, 0, 0, 0);
      // Request from Jan 1, 2026 to get maximum available historical data
      const startDate = new Date("2026-01-01");
      return {
        startDate,
        endDate,
        startKey: formatDate(startDate),
        endKey: formatDate(endDate),
      };
    };

    // Helper to fetch data in chunks due to Luxor API 60-day range limit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchDataInChunks = async (
      luxorEndDate: Date,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<{ revenue: any[]; hashrate: any[] }> => {
      const MAX_DAYS_PER_REQUEST = 60; // Luxor API limit
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allRevenue: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allHashrate: any[] = [];

      let currentEnd = new Date(luxorEndDate);
      const hardStart = new Date("2026-01-01");

      while (currentEnd >= hardStart) {
        const chunkStart = new Date(currentEnd);
        chunkStart.setDate(chunkStart.getDate() - MAX_DAYS_PER_REQUEST + 1);
        
        // Don't go earlier than Jan 1
        if (chunkStart < hardStart) {
          chunkStart.setTime(hardStart.getTime());
        }

        const chunkStartStr = formatDate(chunkStart);
        const chunkEndStr = formatDate(currentEnd);
        
        console.log(
          `[Hashprice History API] Fetching chunk: ${chunkStartStr} to ${chunkEndStr}`,
        );

        // Fetch revenue for this chunk
        const revenueResponse = await luxorClient.getRevenue("BTC", {
          subaccount_names: subaccountName,
          start_date: chunkStartStr,
          end_date: chunkEndStr,
        });

        if (revenueResponse.revenue && Array.isArray(revenueResponse.revenue)) {
          allRevenue.push(...revenueResponse.revenue);
        }

        // Fetch hashrate for this chunk (all pages)
        let currentPage = 1;
        let hasMore = true;
        const pageSize = 100;

        while (hasMore) {
          const hashrateResponse = await luxorClient.getHashrateEfficiency(
            "BTC",
            {
              subaccount_names: subaccountName,
              start_date: chunkStartStr,
              end_date: chunkEndStr,
              tick_size: "1d",
              page_size: pageSize,
              page_number: currentPage,
            },
          );

          console.log(
            `[Hashprice History API] Hashrate page ${currentPage}: records=${hashrateResponse.hashrate_efficiency?.length || 0}, item_count=${hashrateResponse.pagination?.item_count || 0}, has_next=${hashrateResponse.pagination?.next_page_url !== null}`,
          );

          if (
            hashrateResponse.hashrate_efficiency &&
            Array.isArray(hashrateResponse.hashrate_efficiency)
          ) {
            allHashrate.push(...hashrateResponse.hashrate_efficiency);
          }

          hasMore = hashrateResponse.pagination?.next_page_url !== null;
          currentPage++;
        }

        console.log(
          `[Hashprice History API] Chunk ${chunkStartStr} to ${chunkEndStr}: ${allRevenue.length} revenue, ${allHashrate.length} hashrate total so far`,
        );

        // Move to previous chunk
        currentEnd = new Date(chunkStart);
        currentEnd.setDate(currentEnd.getDate() - 1);
      }

      return { revenue: allRevenue, hashrate: allHashrate };
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
      // Get end date for chunk fetching
      const { endDate } = getAPIRequestBounds();
      
      // But report the window we're filtering to
      const { startKey: windowStartKey, endKey: windowEndKey } =
        getWindowBounds(rangeDays);

      console.log(
        `[Hashprice History API] Will filter to window: ${windowStartKey} to ${windowEndKey} (${rangeDays}d)`,
      );

      // Fetch data in chunks to respect Luxor's ~60-day range limit
      const { revenue: revenueList, hashrate: hashrateList } =
        await fetchDataInChunks(endDate);

      console.log(`[Hashprice History API] ===== PERIOD DEBUG =====`);
      console.log(`[Hashprice History API] Requested days: ${rangeDays}`);
      console.log(
        `[Hashprice History API] Filter window: ${windowStartKey} to ${windowEndKey}`,
      );
      console.log(
        `[Hashprice History API] Total revenue records collected: ${revenueList.length}`,
      );
      console.log(
        `[Hashprice History API] Total hashrate records collected: ${hashrateList.length}`,
      );

      const hashrateByDate: Record<string, number> = {};
      if (Array.isArray(hashrateList)) {
        for (const point of hashrateList) {
          const date = extractDateKey(point.date_time);
          if (date && point.hashrate) {
            const hashrate = parseFloat(String(point.hashrate));
            hashrateByDate[date] = hashrate;
          }
        }
      }

      const hashpriceData: HashpricePoint[] = [];
      if (revenueList && Array.isArray(revenueList)) {
        for (const item of revenueList) {
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

    // Note: We request from Jan 1 to today to capture all available data,
    // then filter to the requested window. No fallback needed since
    // we're already requesting the broadest available range.

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
