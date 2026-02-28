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
 * GET /api/pool-hashprice?days=1
 *
 * Fetches pool-wide hashprice (from 'higgs' main pool account)
 * Used by payback analysis to show the same hashprice value for all users
 *
 * Combines:
 * - /pool/revenue/BTC (pool daily earnings from 'higgs')
 * - /pool/hashrate-efficiency/BTC (pool daily hashrate from 'higgs')
 * Calculates: hashprice = pool_revenue / pool_hashrate
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and get user ID
    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("[Pool Hashprice API] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get days parameter from query (default to 1 day)
    const daysParam = request.nextUrl.searchParams.get("days");
    const days = parseInt(daysParam || "1", 10);

    // Luxor API has ~45 days of historical data maximum
    if (isNaN(days) || days < 1 || days > 45) {
      return NextResponse.json(
        { error: "Days must be between 1 and 45 (Luxor API limit)" },
        { status: 400 },
      );
    }

    console.log(
      `[Pool Hashprice API] Fetching ${days} days of POOL-WIDE hashprice data`,
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
      `[Pool Hashprice API] Using subaccount '${subaccountForAuth}' for authentication`,
    );

    // Create Luxor client with valid subaccount for authentication
    const luxorClient = createLuxorClient(subaccountForAuth);

    // Calculate date range
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
      `[Pool Hashprice API] Fetching pool-wide data from ${startDateStr} to ${endDateStr}`,
    );

    // Fetch POOL-WIDE revenue data (using 'higgs' subaccount for main pool data)
    const revenueResponse = await luxorClient.getRevenue("BTC", {
      subaccount_names: "higgs",
      start_date: startDateStr,
      end_date: endDateStr,
    });

    // Fetch POOL-WIDE hashrate data (using 'higgs' subaccount for main pool data)
    const hashrateResponse = await luxorClient.getHashrateEfficiency("BTC", {
      subaccount_names: "higgs",
      start_date: startDateStr,
      end_date: endDateStr,
      tick_size: "1d",
      page_size: 100,
      page_number: 1,
    });

    console.log(
      `[Pool Hashprice API] Pool-wide revenue records: ${revenueResponse.revenue?.length || 0}`,
    );
    console.log(
      `[Pool Hashprice API] Pool-wide hashrate records: ${hashrateResponse.hashrate_efficiency?.length || 0}`,
    );

    // Create a map of hashrate by date for quick lookup
    const hashrateByDate: Record<string, number> = {};
    if (hashrateResponse.hashrate_efficiency) {
      for (const item of hashrateResponse.hashrate_efficiency) {
        const dateStr = item.date_time.split("T")[0];
        // Convert hashrate from H/s to PH/s (1 PH/s = 1e15 H/s)
        const hashrateRaw = parseFloat(item.hashrate);
        const hashratePHs = hashrateRaw / 1e15;
        hashrateByDate[dateStr] = hashratePHs;
      }
    }

    // Calculate hashprice for each date
    const hashpriceData: HashpricePoint[] = [];

    if (revenueResponse.revenue) {
      for (const item of revenueResponse.revenue) {
        const dateStr = item.date_time.split("T")[0];
        const revenue = item.revenue.revenue;
        const hashratePHs = hashrateByDate[dateStr];

        if (hashratePHs && hashratePHs > 0) {
          const hashprice = revenue / hashratePHs;
          hashpriceData.push({
            date: dateStr,
            timestamp: new Date(item.date_time).getTime(),
            hashprice: isFinite(hashprice) ? hashprice : 0,
            revenue,
            hashrate: hashratePHs * 1e15, // Convert back to H/s for consistency
          });
        }
      }
    }

    // Sort by date (ascending)
    hashpriceData.sort((a, b) => a.timestamp - b.timestamp);

    console.log(
      `[Pool Hashprice API] Calculated ${hashpriceData.length} pool-wide hashprice points`,
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
          note: "Pool-wide hashprice (not subaccount-specific)",
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Pool Hashprice API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch pool hashprice",
      },
      { status: 500 },
    );
  }
}
