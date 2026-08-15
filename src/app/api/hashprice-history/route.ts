import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
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
 * Reads the requesting user's Luxor subaccount hashprice history from
 * PoolSubaccountDailySnapshot.hashprice — daily rows backfilled from Luxor's
 * own dailystats export (see scripts/backfill-pool-history.js) and gap-filled
 * from the Luxor API, i.e. the hashprice value Luxor itself reports per
 * subaccount per day. Not capped at Luxor's ~45-day live API retention since
 * it's served from our own DB.
 *
 * The previous strategy (calculating hashprice live as revenue ÷ hashrate via
 * the Luxor API on every request) is kept below, commented out, in case this
 * table ever needs to be bypassed again.
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

    if (isNaN(days) || days < 1 || days > 366) {
      return NextResponse.json(
        { error: "Days must be between 1 and 366" },
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
          success: true,
          data: [],
          message: "No miners assigned",
        },
        { status: 200 },
      );
    }

    // Step 2: Check if user has miners on Luxor pool
    const hasLuxorMiners = miners.some((m) => m.pool?.name === "Luxor");
    if (!hasLuxorMiners) {
      console.log(
        `[Hashprice History API] User ${userId} has no miners on Luxor pool`,
      );
      return NextResponse.json(
        {
          success: true,
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
          success: true,
          data: [],
          message: "No Luxor pool credentials configured",
        },
        { status: 200 },
      );
    }

    // Step 4: Resolve the PoolSubaccount row backing this user's subaccount
    const poolSubaccount = await prisma.poolSubaccount.findUnique({
      where: {
        poolId_subaccountName: {
          poolId: luxorPool.id,
          subaccountName: poolAuth.authKey,
        },
      },
    });

    if (!poolSubaccount) {
      console.log(
        `[Hashprice History API] No PoolSubaccount row for '${poolAuth.authKey}' — nothing backfilled yet`,
      );
      return NextResponse.json(
        {
          success: true,
          data: [],
          message: "No pool subaccount snapshot data found",
        },
        { status: 200 },
      );
    }

    // Step 5: Pull daily snapshots for the requested window from our own DB
    const endDate = new Date();
    endDate.setUTCDate(endDate.getUTCDate() - 1);
    endDate.setUTCHours(0, 0, 0, 0);
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));

    const snapshots = await prisma.poolSubaccountDailySnapshot.findMany({
      where: {
        poolSubaccountId: poolSubaccount.id,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: "asc" },
    });

    const hashpriceData: HashpricePoint[] = snapshots
      .filter((snapshot) => snapshot.hashprice != null)
      .map((snapshot) => ({
        date: snapshot.date.toISOString().split("T")[0],
        timestamp: snapshot.date.getTime(),
        hashprice: Number(snapshot.hashprice),
        revenue: Number(snapshot.totalRevenue),
        hashrate: snapshot.hashrate != null ? Number(snapshot.hashrate) : 0,
      }));

    console.log(
      `[Hashprice History API] Found ${hashpriceData.length} snapshot day(s) for subaccount '${poolAuth.authKey}'`,
    );

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

/* ============================================================================
 * OLD STRATEGY (superseded — kept for reference only, not compiled)
 * ============================================================================
 * Calculated hashprice live on every request as daily_revenue ÷ daily_hashrate
 * by hitting the Luxor API directly (capped at Luxor's ~45-day retention).
 * Replaced by reading PoolSubaccountDailySnapshot.hashprice above. To restore
 * this strategy, re-add `import { createLuxorClient } from "@/lib/luxor";`
 * and splice this back in after Step 3 (PoolAuth lookup) above.
 *
 *   // Step 4: Get subaccount name from PoolAuth.authKey
 *   const subaccountName = poolAuth.authKey;
 *   console.log(
 *     `[Hashprice History API] Using subaccount '${subaccountName}' for user ${userId}`,
 *   );
 *
 *   // Create Luxor client for logging purposes
 *   const luxorClient = createLuxorClient(subaccountName);
 *
 *   // Format dates as YYYY-MM-DD for Luxor API
 *   const formatDate = (date: Date) => {
 *     const year = date.getFullYear();
 *     const month = String(date.getMonth() + 1).padStart(2, "0");
 *     const day = String(date.getDate()).padStart(2, "0");
 *     return `${year}-${month}-${day}`;
 *   };
 *
 *   // Keep date extraction stable across Luxor timestamps without timezone shifts.
 *   const extractDateKey = (value?: string | null): string | null => {
 *     if (!value) return null;
 *     if (value.includes("T")) {
 *       return value.split("T")[0] || null;
 *     }
 *     if (value.length >= 10) {
 *       return value.slice(0, 10);
 *     }
 *     return null;
 *   };
 *
 *   const getWindowBounds = (rangeDays: number) => {
 *     const endDate = new Date();
 *     endDate.setDate(endDate.getDate() - 1);
 *     endDate.setHours(0, 0, 0, 0);
 *     const startDate = new Date(endDate);
 *     startDate.setDate(startDate.getDate() - (rangeDays - 1));
 *     return {
 *       startDate,
 *       endDate,
 *       startKey: formatDate(startDate),
 *       endKey: formatDate(endDate),
 *     };
 *   };
 *
 *   const getAPIRequestBounds = () => {
 *     // Request from a fixed early date to today to capture all available data
 *     // (Luxor hashrate data is sparse, so we need to request broadly)
 *     const endDate = new Date();
 *     endDate.setDate(endDate.getDate() - 1);
 *     endDate.setHours(0, 0, 0, 0);
 *     // Request from Jan 1, 2026 to get maximum available historical data
 *     const startDate = new Date("2026-01-01");
 *     return {
 *       startDate,
 *       endDate,
 *       startKey: formatDate(startDate),
 *       endKey: formatDate(endDate),
 *     };
 *   };
 *
 *   // Helper to fetch data in chunks due to Luxor API 60-day range limit
 *   const fetchDataInChunks = async (
 *     luxorEndDate: Date,
 *   ): Promise<{ revenue: any[]; hashrate: any[] }> => {
 *     const MAX_DAYS_PER_REQUEST = 60; // Luxor API limit
 *     const allRevenue: any[] = [];
 *     const allHashrate: any[] = [];
 *
 *     let currentEnd = new Date(luxorEndDate);
 *     const hardStart = new Date("2026-01-01");
 *
 *     while (currentEnd >= hardStart) {
 *       const chunkStart = new Date(currentEnd);
 *       chunkStart.setDate(chunkStart.getDate() - MAX_DAYS_PER_REQUEST + 1);
 *
 *       // Don't go earlier than Jan 1
 *       if (chunkStart < hardStart) {
 *         chunkStart.setTime(hardStart.getTime());
 *       }
 *
 *       const chunkStartStr = formatDate(chunkStart);
 *       const chunkEndStr = formatDate(currentEnd);
 *
 *       // Fetch revenue for this chunk
 *       const revenueResponse = await luxorClient.getRevenue("BTC", {
 *         subaccount_names: subaccountName,
 *         start_date: chunkStartStr,
 *         end_date: chunkEndStr,
 *       });
 *
 *       if (revenueResponse.revenue && Array.isArray(revenueResponse.revenue)) {
 *         allRevenue.push(...revenueResponse.revenue);
 *       }
 *
 *       // Fetch hashrate for this chunk (all pages)
 *       let currentPage = 1;
 *       let hasMore = true;
 *       const pageSize = 100;
 *
 *       while (hasMore) {
 *         const hashrateResponse = await luxorClient.getHashrateEfficiency(
 *           "BTC",
 *           {
 *             subaccount_names: subaccountName,
 *             start_date: chunkStartStr,
 *             end_date: chunkEndStr,
 *             tick_size: "1d",
 *             page_size: pageSize,
 *             page_number: currentPage,
 *           },
 *         );
 *
 *         if (
 *           hashrateResponse.hashrate_efficiency &&
 *           Array.isArray(hashrateResponse.hashrate_efficiency)
 *         ) {
 *           allHashrate.push(...hashrateResponse.hashrate_efficiency);
 *         }
 *
 *         hasMore = hashrateResponse.pagination?.next_page_url !== null;
 *         currentPage++;
 *       }
 *
 *       // Move to previous chunk
 *       currentEnd = new Date(chunkStart);
 *       currentEnd.setDate(currentEnd.getDate() - 1);
 *     }
 *
 *     return { revenue: allRevenue, hashrate: allHashrate };
 *   };
 *
 *   const filterByWindow = (data: HashpricePoint[], rangeDays: number) => {
 *     const { startKey, endKey } = getWindowBounds(rangeDays);
 *     return data
 *       .filter((point) => point.date >= startKey && point.date <= endKey)
 *       .sort((a, b) => a.timestamp - b.timestamp);
 *   };
 *
 *   // Fetch helper with consistent date formatting and merge logic.
 *   const fetchHashpriceRange = async (
 *     rangeDays: number,
 *   ): Promise<HashpricePoint[]> => {
 *     // Get end date for chunk fetching
 *     const { endDate } = getAPIRequestBounds();
 *
 *     // But report the window we're filtering to
 *     const { startKey: windowStartKey, endKey: windowEndKey } =
 *       getWindowBounds(rangeDays);
 *
 *     // Fetch data in chunks to respect Luxor's ~60-day range limit
 *     const { revenue: revenueList, hashrate: hashrateList } =
 *       await fetchDataInChunks(endDate);
 *
 *     const hashrateByDate: Record<string, number> = {};
 *     if (Array.isArray(hashrateList)) {
 *       for (const point of hashrateList) {
 *         const date = extractDateKey(point.date_time);
 *         if (date && point.hashrate) {
 *           const hashrate = parseFloat(String(point.hashrate));
 *           hashrateByDate[date] = hashrate;
 *         }
 *       }
 *     }
 *
 *     const hashpriceData: HashpricePoint[] = [];
 *     if (revenueList && Array.isArray(revenueList)) {
 *       for (const item of revenueList) {
 *         if (item && item.date_time) {
 *           const dateStr = extractDateKey(item.date_time);
 *           if (!dateStr) continue;
 *           const revenue = item.revenue?.revenue || 0;
 *           const hashrateRaw = hashrateByDate[dateStr] || 0;
 *
 *           // Hashrate from API is in H/s, but hashprice is BTC/PH/s/day.
 *           const hashratePHs = hashrateRaw / 1e15;
 *           if (hashratePHs > 0) {
 *             const hashprice = revenue / hashratePHs;
 *             hashpriceData.push({
 *               date: dateStr,
 *               timestamp: new Date(item.date_time).getTime(),
 *               hashprice: isFinite(hashprice) ? hashprice : 0,
 *               revenue,
 *               hashrate: hashrateRaw,
 *             });
 *           }
 *         }
 *       }
 *     }
 *
 *     hashpriceData.sort((a, b) => a.timestamp - b.timestamp);
 *     return hashpriceData;
 *   };
 *
 *   let hashpriceData = await fetchHashpriceRange(days);
 *   hashpriceData = filterByWindow(hashpriceData, days);
 *
 *   // Note: We request from Jan 1 to today to capture all available data,
 *   // then filter to the requested window. No fallback needed since
 *   // we're already requesting the broadest available range.
 *
 *   // Calculate statistics
 *   const current =
 *     hashpriceData.length > 0
 *       ? hashpriceData[hashpriceData.length - 1].hashprice
 *       : 0;
 *   const high =
 *     hashpriceData.length > 0
 *       ? Math.max(...hashpriceData.map((d) => d.hashprice))
 *       : 0;
 *   const low =
 *     hashpriceData.length > 0
 *       ? Math.min(...hashpriceData.map((d) => d.hashprice))
 *       : 0;
 *
 *   return NextResponse.json(
 *     {
 *       success: true,
 *       data: hashpriceData,
 *       statistics: {
 *         current,
 *         high,
 *         low,
 *         daysReturned: hashpriceData.length,
 *         currency: "BTC",
 *         unit: "BTC/PH/s/Day",
 *       },
 *       timestamp: new Date().toISOString(),
 *     },
 *     { status: 200 },
 *   );
 * ==========================================================================*/
