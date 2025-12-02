import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { createLuxorClient } from "@/lib/luxor";

interface DailyPerformanceData {
  date: string;
  earnings: number;
  costs: number;
  hashRate: number;
}

interface LuxorRevenueItem {
  timestamp?: string;
  date?: string;
  btc_revenue?: number;
  revenue?: number;
  estimated_earnings?: number;
}

interface LuxorRevenueResponse {
  currency_type?: string;
  start_date?: string;
  end_date?: string;
  subaccounts?: Array<{
    name: string;
    display_name?: string;
  }>;
  revenue?: LuxorRevenueItem[];
  [key: string]: unknown;
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
    const revenueResponse = await luxorClient.request<LuxorRevenueResponse>(
      "/pool/revenue/BTC",
      {
        subaccount_names: subaccountName,
        start_date: startDateStr,
        end_date: endDateStr,
      },
    );

    console.log(
      `[Mining Performance API] Received Luxor revenue response with keys:`,
      Object.keys(revenueResponse).slice(0, 5),
    );

    // Transform Luxor response into chart data format
    // Response structure: { revenue: [ { timestamp/date, btc_revenue/revenue }, ... ] }
    const performanceData: DailyPerformanceData[] = [];

    // Handle both array and object response formats from Luxor
    if (revenueResponse && Array.isArray(revenueResponse.revenue)) {
      console.log(
        `[Mining Performance API] Processing ${revenueResponse.revenue.length} revenue items from Luxor`,
      );

      for (const item of revenueResponse.revenue) {
        if (item && typeof item === "object") {
          // Extract date from timestamp or date field
          const dateStr =
            item.date ||
            (item.timestamp
              ? new Date(item.timestamp).toISOString().split("T")[0]
              : null);

          if (!dateStr) {
            console.warn(
              "[Mining Performance API] Skipping item without date:",
              item,
            );
            continue;
          }

          // Extract BTC revenue from various possible field names
          const btcRevenue = Number(item.btc_revenue || item.revenue || 0) || 0;

          performanceData.push({
            date: dateStr,
            earnings: btcRevenue, // BTC revenue from Luxor
            costs: 0, // Not available from Luxor revenue endpoint
            hashRate: 0, // Available separately from workers endpoint if needed
          });
        }
      }
    } else if (revenueResponse && typeof revenueResponse === "object") {
      // Fallback: try to parse as date-keyed object
      const allDates = Object.keys(revenueResponse)
        .filter(
          (key) =>
            key !== "currency_type" &&
            key !== "start_date" &&
            key !== "end_date" &&
            key !== "subaccounts" &&
            key !== "revenue",
        )
        .sort();
      const recentDates = allDates.slice(-days);

      console.log(
        `[Mining Performance API] Processing ${recentDates.length} dates from Luxor (fallback mode)`,
      );

      for (const dateStr of recentDates) {
        const dailyRevenue = (revenueResponse as Record<string, unknown>)[
          dateStr
        ];

        if (dailyRevenue && typeof dailyRevenue === "object") {
          const dailyRevenueObj = dailyRevenue as Record<string, unknown>;
          const btcRevenue =
            Number(
              dailyRevenueObj.btc_revenue || dailyRevenueObj.revenue || 0,
            ) || 0;

          performanceData.push({
            date: dateStr,
            earnings: btcRevenue,
            costs: 0,
            hashRate: 0,
          });
        }
      }
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
