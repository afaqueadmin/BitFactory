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

    // Calculate date range
    // Note: Luxor API requires end_date to be in the past, so we use yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const startDate = new Date(yesterday);
    startDate.setDate(startDate.getDate() - days);

    // Format dates as YYYY-MM-DD for Luxor API
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(yesterday);

    console.log(
      `[Hashprice History API] Fetching pool-wide data from ${startDateStr} to ${endDateStr}`,
    );

    // Fetch pool-wide revenue data from /pool/revenue/BTC
    // NOTE: Using 'higgs' subaccount for pool-wide data (main pool account)
    const revenueResponse = await luxorClient.getRevenue("BTC", {
      subaccount_names: "higgs",
      start_date: startDateStr,
      end_date: endDateStr,
    });

    // Fetch pool-wide hashrate data from /pool/hashrate-efficiency/BTC (daily tick_size)
    // NOTE: Using 'higgs' subaccount for pool-wide data (main pool account)
    console.log(
      `[Hashprice History API] Requesting pool-wide hashrate from ${startDateStr} to ${endDateStr} (${days} days)`,
    );

    const hashrateResponse = await luxorClient.getHashrateEfficiency("BTC", {
      subaccount_names: "higgs",
      start_date: startDateStr,
      end_date: endDateStr,
      tick_size: "1d",
      page_size: 100, // Increase page size to get more records per request
      page_number: 1,
    });

    console.log(`[Hashprice History API] ===== PERIOD DEBUG =====`);
    console.log(`[Hashprice History API] Requested days: ${days}`);
    console.log(
      `[Hashprice History API] Date range: ${startDateStr} to ${endDateStr}`,
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

    // Check if we got fewer records than requested
    const recordsReturned = hashrateResponse.hashrate_efficiency?.length || 0;
    if (recordsReturned < days) {
      console.log(
        `[Hashprice History API] ⚠️  WARNING: Got ${recordsReturned} records but requested ${days} days - API may have limited history`,
      );
    }

    // Create a map of hashrate by date for quick lookup
    const hashrateByDate: Record<string, number> = {};
    if (
      hashrateResponse.hashrate_efficiency &&
      Array.isArray(hashrateResponse.hashrate_efficiency)
    ) {
      console.log(
        `[Hashprice History API] Processing ${hashrateResponse.hashrate_efficiency.length} hashrate records`,
      );
      for (const point of hashrateResponse.hashrate_efficiency) {
        const date = point.date_time
          ? new Date(point.date_time).toISOString().split("T")[0]
          : null;
        if (date && point.hashrate) {
          const hashrate = parseFloat(String(point.hashrate));
          hashrateByDate[date] = hashrate;
          console.log(
            `[Hashprice History API] Hashrate for ${date}: ${hashrate}`,
          );
        }
      }
    }

    console.log(
      `[Hashprice History API] Hashrate map has ${Object.keys(hashrateByDate).length} entries`,
    );

    // Merge revenue and hashrate data, calculate hashprice
    const hashpriceData: HashpricePoint[] = [];

    if (revenueResponse.revenue && Array.isArray(revenueResponse.revenue)) {
      console.log(
        `[Hashprice History API] Processing ${revenueResponse.revenue.length} revenue records`,
      );
      for (const item of revenueResponse.revenue) {
        if (item && item.date_time) {
          const dateStr = item.date_time.split("T")[0]; // Extract YYYY-MM-DD
          const revenue = item.revenue?.revenue || 0;
          const hashrateRaw = hashrateByDate[dateStr] || 0;

          // Hashrate from API is in H/s, but we need PH/s (Petahash/s)
          // 1 PH/s = 1e15 H/s
          const hashratePHs = hashrateRaw / 1e15;

          console.log(
            `[Hashprice History API] Date: ${dateStr}, Revenue: ${revenue}, Hashrate: ${hashrateRaw} H/s (${hashratePHs} PH/s)`,
          );

          // Calculate hashprice: revenue (BTC) / hashrate (PH/s)
          // Result: BTC/PH/s/day
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

    // Sort by date (ascending)
    hashpriceData.sort((a, b) => a.timestamp - b.timestamp);

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
