import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient } from "@/lib/luxor";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/wallet/earnings-24h
 *
 * Fetches 24-hour earnings (revenue) from Luxor API
 * Returns aggregated data across all subaccounts for the last 24 hours
 *
 * Response:
 * {
 *   revenue24h: { btc: number, usd: number },
 *   currency: "BTC",
 *   timestamp: string,
 *   dataSource: "luxor"
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication via JWT token in cookies
    const token = request.cookies.get("token")?.value;
    if (!token) {
      console.log("[24h Revenue API] Unauthorized access attempt - no token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch (error) {
      console.log("[24h Revenue API] Invalid token:", error);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = decoded.userId;
    console.log(`[24h Revenue API] Fetching data for user: ${userId}`);

    // Get user's subaccount name from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { luxorSubaccountName: true },
    });

    if (!user?.luxorSubaccountName) {
      console.log(`[24h Revenue API] User ${userId} has no Luxor subaccount`);
      return NextResponse.json(
        {
          revenue24h: { btc: 0, usd: 0 },
          currency: "BTC",
          timestamp: new Date().toISOString(),
          dataSource: "none",
          message: "No Luxor subaccount assigned",
        },
        { status: 200 },
      );
    }

    // Create Luxor client
    const client = createLuxorClient(user.luxorSubaccountName);

    // Calculate date range - last 24 hours
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
    const formatDate = (date: Date) => date.toISOString().split("T")[0];

    console.log(
      `[24h Revenue API] Fetching transactions for last 24 hours (${formatDate(startDate)} to ${formatDate(endDate)})`,
    );

    // Fetch all credit transactions from last 24 hours
    const transactions = await client.getTransactions("BTC", {
      transaction_type: "credit",
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
      subaccount_names: user.luxorSubaccountName,
      page_size: 1000, // Get all transactions in one request if possible
    });

    // Calculate 24-hour revenue from transactions
    let revenue24hBtc = 0;
    let revenue24hUsd = 0;

    if (transactions.transactions && transactions.transactions.length > 0) {
      for (const tx of transactions.transactions) {
        revenue24hBtc += tx.currency_amount;
        revenue24hUsd += tx.usd_equivalent;
      }
    }

    console.log(
      `[24h Revenue API] 24-hour revenue: ${revenue24hBtc} BTC ($${revenue24hUsd})`,
    );

    return NextResponse.json({
      revenue24h: {
        btc: Number(revenue24hBtc.toFixed(8)),
        usd: Number(revenue24hUsd.toFixed(2)),
      },
      currency: "BTC",
      timestamp: new Date().toISOString(),
      dataSource: "luxor",
    });
  } catch (error) {
    console.error("[24h Revenue API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch 24-hour earnings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
