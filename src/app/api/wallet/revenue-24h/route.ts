import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient } from "@/lib/luxor";
import { prisma } from "@/lib/prisma";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function GET(
  req: NextRequest,
): Promise<NextResponse<ApiResponse>> {
  try {
    // Verify authentication
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const decoded = await verifyJwtToken(token);
    if (!decoded) {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    // Get user's subaccount name from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { luxorSubaccountName: true },
    });

    if (!user?.luxorSubaccountName) {
      return NextResponse.json(
        {
          success: true,
          data: {
            revenue_usd: 0,
            revenue_crypto: 0,
            transaction_count: 0,
            currency: "BTC",
          },
        },
        { status: 200 },
      );
    }

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const currency = searchParams.get("currency") || "BTC";

    // Calculate date range for last 24 hours
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

    // Format dates as YYYY-MM-DD
    const formatDate = (date: Date) => date.toISOString().split("T")[0];

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    console.log(
      `[Wallet API] Fetching 24h revenue for ${currency} from ${startDateStr} to ${endDateStr}`,
    );

    // Create Luxor client and fetch transactions from last 24 hours
    const luxorClient = createLuxorClient(user.luxorSubaccountName);
    const response = await luxorClient.getTransactions(currency, {
      start_date: startDateStr,
      end_date: endDateStr,
      transaction_type: "credit", // Only count incoming transactions as revenue
      page_size: 1000, // Get all transactions in the last 24h
    });

    if (!response || !response.transactions) {
      return NextResponse.json(
        {
          success: true,
          data: {
            revenue_usd: 0,
            revenue_crypto: 0,
            transaction_count: 0,
            currency,
          },
        },
        { status: 200 },
      );
    }

    // Calculate total revenue in USD and crypto
    const revenue_usd = response.transactions.reduce(
      (sum, tx) => sum + (tx.usd_equivalent || 0),
      0,
    );
    const revenue_crypto = response.transactions.reduce(
      (sum, tx) => sum + (tx.currency_amount || 0),
      0,
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          revenue_usd: parseFloat(revenue_usd.toFixed(2)),
          revenue_crypto: parseFloat(revenue_crypto.toFixed(8)),
          transaction_count: response.transactions.length,
          currency,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Wallet API] Revenue 24h error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
