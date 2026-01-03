import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { createLuxorClient, RevenueResponse, RevenueData } from "@/lib/luxor";

interface DailyPerformanceData {
  date: string;
  earnings: number;
  costs: number;
  hashRate: number;
}

/**
 * GET /api/mining/daily-performance?days=10
 * Fetches daily mining revenue data from Luxor API /pool/revenue/BTC endpoint
 * Returns 10 days of earnings data for the user's Luxor subaccount
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
        "[Mining Performance API] Token verification failed:",
        error,
      );
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get days parameter from query (default to 10 days)
    const daysParam = request.nextUrl.searchParams.get("days");
    const days = parseInt(daysParam || "10", 10);

    if (isNaN(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: "Days must be between 1 and 365" },
        { status: 400 },
      );
    }

    console.log(
      `[Mining Performance API] Fetching ${days} days of mining revenue data for user ${userId}`,
    );

    // Fetch the user's Luxor subaccount name from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { luxorSubaccountName: true },
    });

    if (!user || !user.luxorSubaccountName) {
      console.error(
        `[Mining Performance API] User ${userId} has no Luxor subaccount configured`,
      );
      return NextResponse.json(
        { error: "Luxor subaccount not configured for user" },
        { status: 404 },
      );
    }

    const subaccountName = user.luxorSubaccountName;
    console.log(
      `[Mining Performance API] Fetching revenue from Luxor for subaccount: ${subaccountName}`,
    );

    // Create Luxor client
    const luxorClient = createLuxorClient(subaccountName);

    // Calculate start_date (N days ago) and end_date (today)
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
      `[Mining Performance API] Fetching revenue from ${startDateStr} to ${endDateStr}`,
    );

    // Fetch revenue data from Luxor /pool/revenue/BTC endpoint
    // Returns daily revenue breakdown for the user's subaccount
    // Using getRevenue method for better error handling
    const revenueResponse = await luxorClient.getRevenue("BTC", {
      subaccount_names: subaccountName,
      start_date: startDateStr,
      end_date: endDateStr,
    });

    console.log(
      `[Mining Performance API] Received Luxor revenue response with keys:`,
      Object.keys(revenueResponse).slice(0, 5),
    );
    console.log(
      `[Mining Performance API] Full response:`,
      JSON.stringify(revenueResponse).substring(0, 500),
    );

    // Transform Luxor response into chart data format
    // Response structure: { revenue: [ { date_time, revenue: { revenue: number } }, ... ] }
    const performanceData: DailyPerformanceData[] = [];

    // Luxor API returns revenue as an array of objects with date_time and revenue data
    if (revenueResponse && Array.isArray(revenueResponse.revenue)) {
      console.log(
        `[Mining Performance API] Processing ${revenueResponse.revenue.length} revenue items from Luxor`,
      );

      for (const item of revenueResponse.revenue) {
        if (item && typeof item === "object") {
          // Extract date from date_time (format: YYYY-MM-DDTHH:mm:ss or similar)
          const dateStr =
            item.date_time && typeof item.date_time === "string"
              ? item.date_time.split("T")[0] // Extract YYYY-MM-DD from ISO datetime
              : null;

          if (!dateStr) {
            console.warn(
              "[Mining Performance API] Skipping item without valid date_time:",
              item,
            );
            continue;
          }

          // Extract BTC revenue from the revenue field
          // Luxor returns: revenue: { currency_type: "BTC", revenue_type: "pool", revenue: number }
          let btcRevenue = 0;
          if (item.revenue && typeof item.revenue === "object") {
            const revenueObj = item.revenue as Record<string, unknown>;
            btcRevenue = Number(revenueObj.revenue || 0) || 0;
          }

          performanceData.push({
            date: dateStr,
            earnings: btcRevenue, // BTC revenue from Luxor
            costs: 0, // Not available from Luxor revenue endpoint
            hashRate: 0, // Available separately from workers endpoint if needed
          });
        }
      }

      console.log(
        `[Mining Performance API] Parsed ${performanceData.length} daily performance records from Luxor`,
      );
    } else {
      console.warn(
        "[Mining Performance API] Revenue response does not have expected array format:",
        typeof revenueResponse.revenue,
      );
    }

    // Sort by date to ensure chronological order
    performanceData.sort((a, b) => a.date.localeCompare(b.date));

    // If no data from Luxor, return empty but valid response
    if (performanceData.length === 0) {
      console.warn(
        `[Mining Performance API] No revenue data returned from Luxor for ${days} days`,
      );
    }

    // Calculate summary statistics
    const totalEarnings = performanceData.reduce(
      (sum, d) => sum + d.earnings,
      0,
    );
    const avgEarnings =
      performanceData.length > 0 ? totalEarnings / performanceData.length : 0;

    console.log(
      `[Mining Performance API] Returning ${performanceData.length} days of revenue data`,
    );

    return NextResponse.json(
      {
        success: true,
        data: performanceData,
        summary: {
          daysReturned: performanceData.length,
          totalEarnings: parseFloat(totalEarnings.toFixed(8)),
          averageDailyEarnings: parseFloat(avgEarnings.toFixed(8)),
          currency: "BTC",
          dataSource: "Luxor API /pool/revenue/BTC",
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Mining Performance API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch mining performance data from Luxor API",
      },
      { status: 500 },
    );
  }
}
