import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { createLuxorClient } from "@/lib/luxor";

interface HashpricePoint {
  date: string;
  timestamp: number;
  hashprice: number;
  revenue: number;
  hashrate: number;
}

/**
 * GET /api/hashprice-history?days=30
 * Fetches historical hashprice data by combining:
 * - /pool/revenue/BTC (daily earnings)
 * - /pool/hashrate-efficiency/BTC (daily hashrate)
 * Calculates: hashprice = daily_revenue / daily_hashrate
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

    if (isNaN(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: "Days must be between 1 and 365" },
        { status: 400 },
      );
    }

    console.log(
      `[Hashprice History API] Fetching ${days} days of hashprice data for user ${userId}`,
    );

    // Fetch the user's Luxor subaccount name from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { luxorSubaccountName: true },
    });

    if (!user || !user.luxorSubaccountName) {
      console.error(
        `[Hashprice History API] User ${userId} has no Luxor subaccount configured`,
      );
      return NextResponse.json(
        { error: "Luxor subaccount not configured for user" },
        { status: 404 },
      );
    }

    const subaccountName = user.luxorSubaccountName;
    console.log(
      `[Hashprice History API] Fetching data for subaccount: ${subaccountName}`,
    );

    // Create Luxor client
    const luxorClient = createLuxorClient(subaccountName);

    // Calculate date range
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);

    // Format dates as YYYY-MM-DD for Luxor API
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(today);

    console.log(
      `[Hashprice History API] Fetching data from ${startDateStr} to ${endDateStr}`,
    );

    // Fetch revenue data from /pool/revenue/BTC
    const revenueResponse = await luxorClient.getRevenue("BTC", {
      subaccount_names: subaccountName,
      start_date: startDateStr,
      end_date: endDateStr,
    });

    // Fetch hashrate data from /pool/hashrate-efficiency/BTC (daily tick_size)
    // Note: API is paginated, we need to handle pagination to get all data
    const hashrateResponse = await luxorClient.getHashrateEfficiency("BTC", {
      subaccount_names: subaccountName,
      start_date: startDateStr,
      end_date: endDateStr,
      tick_size: "1d",
      page_size: 100, // Increase page size to get more records per request
      page_number: 1,
    });

    console.log(
      `[Hashprice History API] Revenue records: ${revenueResponse.revenue?.length || 0}`,
    );
    console.log(
      `[Hashprice History API] Hashrate records: ${hashrateResponse.hashrate_efficiency?.length || 0}`,
    );

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

    console.log(
      `[Hashprice History API] Calculated ${hashpriceData.length} hashprice points`,
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
