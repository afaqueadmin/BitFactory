import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient } from "@/lib/luxor";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/wallet/earnings-summary
 *
 * Fetches earnings and pending payouts from Luxor API
 * Returns aggregated data across all subaccounts
 *
 * Response:
 * {
 *   totalEarnings: { btc: number, usd: number },
 *   pendingPayouts: { btc: number, usd: number },
 *   currency: "BTC",
 *   dataSource: "luxor",
 *   timestamp: string,
 *   subaccountCount: number
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication via JWT token in cookies
    const token = request.cookies.get("token")?.value;
    if (!token) {
      console.log(
        "[Earnings Summary API] Unauthorized access attempt - no token",
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch (error) {
      console.log("[Earnings Summary API] Invalid token:", error);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userId = decoded.userId;
    const userRole = decoded.role;
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");
    if (customerId) {
      if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Only administrators can search by customerId" },
          { status: 403 },
        );
      }
      userId = customerId;
    }

    console.log(`[Earnings Summary API] Fetching data for user: ${userId}`);

    // Get user's subaccount name from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { luxorSubaccountName: true },
    });

    if (!user?.luxorSubaccountName) {
      console.log(
        `[Earnings Summary API] User ${userId} has no Luxor subaccount`,
      );
      return NextResponse.json(
        {
          totalEarnings: { btc: 0, usd: 0 },
          pendingPayouts: { btc: 0, usd: 0 },
          currency: "BTC",
          dataSource: "none",
          timestamp: new Date().toISOString(),
          subaccountCount: 0,
          message: "No Luxor subaccount assigned",
        },
        { status: 200 },
      );
    }

    // Create Luxor client
    const client = createLuxorClient(user.luxorSubaccountName);

    // Fetch payment settings to get pending balance
    console.log(
      `[Earnings Summary API] Fetching payment settings for ${user.luxorSubaccountName}`,
    );
    const paymentSettings = await client.getPaymentSettings("BTC");

    // Calculate total pending payouts
    let totalPendingBtc = 0;
    const subaccountCount = paymentSettings.payment_settings.length;

    for (const setting of paymentSettings.payment_settings) {
      console.log(
        `[Earnings Summary API] Subaccount ${setting.subaccount.name} - Balance: ${setting.balance} BTC, Status: ${setting.status}`,
      );
      totalPendingBtc += setting.balance;
    }

    // Fetch transactions to calculate total earnings (all credits)
    console.log(
      `[Earnings Summary API] Fetching transactions for ${user.luxorSubaccountName}`,
    );

    // Calculate date range - fetch all-time (use a large date range)
    const endDate = new Date();
    const startDate = new Date("2020-01-01"); // Far back date to catch all transactions
    const formatDate = (date: Date) => date.toISOString().split("T")[0];

    const transactions = await client.getTransactions("BTC", {
      transaction_type: "credit",
      page_size: 1,
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
      subaccount_names: user.luxorSubaccountName,
    });

    // Calculate total earnings from all transactions
    // Note: We're doing a simplified calculation - in production you might want to
    // cache this or use a different approach if there are millions of transactions
    let totalEarningsBtc = 0;
    let totalEarningsUsd = 0;

    // Get first page to establish baseline
    let currentPage = 1;
    let hasMore = true;
    const pageSize = 100;

    console.log(
      `[Earnings Summary API] Starting transaction aggregation - Total items: ${transactions.pagination.item_count}`,
    );

    while (hasMore) {
      const pageTransactions = await client.getTransactions("BTC", {
        transaction_type: "credit",
        page_number: currentPage,
        page_size: pageSize,
        start_date: formatDate(startDate),
        end_date: formatDate(endDate),
        subaccount_names: user.luxorSubaccountName,
      });

      for (const tx of pageTransactions.transactions) {
        totalEarningsBtc += tx.currency_amount;
        totalEarningsUsd += tx.usd_equivalent;
      }

      hasMore = pageTransactions.pagination.next_page_url !== null;
      currentPage++;

      console.log(
        `[Earnings Summary API] Processed page ${currentPage - 1}, running total: ${totalEarningsBtc} BTC`,
      );
    }

    console.log(
      `[Earnings Summary API] Completed aggregation - Total Earnings: ${totalEarningsBtc} BTC (${totalEarningsUsd} USD)`,
    );

    // Get current BTC price for pending payouts USD conversion
    // Use the most recent transaction's price as reference, or estimate
    let pendingPayoutsUsd = 0;
    if (transactions.transactions.length > 0) {
      const recentTx = transactions.transactions[0];
      const btcPrice = recentTx.usd_equivalent / recentTx.currency_amount;
      pendingPayoutsUsd = totalPendingBtc * btcPrice;
    }

    const response = {
      totalEarnings: {
        btc: parseFloat(totalEarningsBtc.toFixed(8)),
        usd: parseFloat(totalEarningsUsd.toFixed(2)),
      },
      pendingPayouts: {
        btc: parseFloat(totalPendingBtc.toFixed(8)),
        usd: parseFloat(pendingPayoutsUsd.toFixed(2)),
      },
      currency: "BTC",
      dataSource: "luxor",
      timestamp: new Date().toISOString(),
      subaccountCount,
    };

    console.log(`[Earnings Summary API] Response:`, response);

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[Earnings Summary API] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to fetch earnings summary",
        details: errorMessage,
      },
      { status: 500 },
    );
  }
}
