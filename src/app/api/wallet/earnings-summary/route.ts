import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient } from "@/lib/luxor";
import { createBraiinsClient } from "@/lib/braiins";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/wallet/earnings-summary
 *
 * Fetches earnings and pending payouts from Luxor API
 * Returns aggregated data across all subaccounts
 *
 * Response:
 * {
 *   totalEarnings: { btc: number },
 *   pendingPayouts: { btc: number },
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
      if (userRole === "FRANCHISEE") {
        const owned = await prisma.user.findFirst({
          where: { id: customerId, franchisee: { franchiseeId: userId } },
          select: { id: true },
        });
        if (!owned) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      } else if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Only administrators can search by customerId" },
          { status: 403 },
        );
      }
      userId = customerId;
    }

    console.log(`[Earnings Summary API] Fetching data for user: ${userId}`);

    // Get PoolAuth entries for this user (contains API keys). Which pools are
    // active is determined directly from PoolAuth, not from Miner.poolId -
    // a user's Braiins/Luxor account is authenticated independently of
    // whether any Miner row happens to be tagged with that pool.
    const poolAuths = await prisma.poolAuth.findMany({
      where: { userId },
      include: { pool: { select: { id: true, name: true } } },
    });

    if (!poolAuths || poolAuths.length === 0) {
      console.log(`[Earnings Summary API] User ${userId} has no pool accounts`);
      return NextResponse.json(
        {
          totalEarnings: { btc: 0, usd: 0 },
          pendingPayouts: { btc: 0, usd: 0 },
          currency: "BTC",
          dataSource: "none",
          timestamp: new Date().toISOString(),
          poolBreakdown: {
            luxor: { totalEarnings: 0, pendingPayouts: 0 },
            braiins: { totalEarnings: 0, pendingPayouts: 0 },
          },
          message: "No pool accounts configured",
        },
        { status: 200 },
      );
    }

    const luxorAuth = poolAuths.find((auth) =>
      auth.pool.name.toLowerCase().includes("luxor"),
    );
    const braiinsAuth = poolAuths.find((auth) =>
      auth.pool.name.toLowerCase().includes("braiins"),
    );

    let totalLuxorEarnings = 0;
    let totalLuxorPending = 0;
    let totalBraiinsEarnings = 0;
    let totalBraiinsPending = 0;

    const endDate = new Date();
    const startDate = new Date("2020-01-01");
    const formatDate = (date: Date) => date.toISOString().split("T")[0];

    // Fetch from Luxor
    if (luxorAuth) {
      try {
        const authKey = luxorAuth.authKey;
        console.log(
          `[Earnings Summary API] Fetching Luxor data for auth key: ${authKey}`,
        );
        const client = createLuxorClient(authKey);

        // Get payment settings for pending balance
        const paymentSettings = await client.getSubaccountPaymentSettings(
          "BTC",
          authKey,
        );
        totalLuxorPending += paymentSettings.balance || 0;

        // Fetch all transactions to calculate total earnings
        let currentPage = 1;
        let hasMore = true;
        const pageSize = 100;

        while (hasMore) {
          const pageTransactions = await client.getTransactions("BTC", {
            transaction_type: "credit",
            page_number: currentPage,
            page_size: pageSize,
            start_date: formatDate(startDate),
            end_date: formatDate(endDate),
            subaccount_names: authKey,
          });

          for (const tx of pageTransactions.transactions) {
            totalLuxorEarnings += tx.currency_amount;
          }

          hasMore = pageTransactions.pagination.next_page_url !== null;
          currentPage++;
        }

        console.log(
          `[Earnings Summary API] Luxor - totalEarnings: ${totalLuxorEarnings}, pendingPayouts: ${totalLuxorPending}`,
        );
      } catch (error) {
        console.error(
          `[Earnings Summary API] Error fetching Luxor summary data:`,
          error,
        );
      }
    }

    // Fetch from Braiins
    if (braiinsAuth) {
      try {
        const authKey = braiinsAuth.authKey;
        console.log(
          `[Earnings Summary API] Fetching Braiins data for auth key: ${authKey}`,
        );
        const braiinsClient = createBraiinsClient(authKey);

        // Get user profile for current pending balance and all-time reward.
        // all_time_reward mirrors Luxor's "sum of all credit transactions"
        // semantics (gross earned, all-time), rather than summing realized
        // payouts (which nets out withdrawal fees and excludes any balance
        // that hasn't reached the payout threshold yet).
        const profile = await braiinsClient.getUserProfile();
        if (profile?.btc) {
          totalBraiinsPending += parseFloat(profile.btc.current_balance) || 0;
          totalBraiinsEarnings += parseFloat(profile.btc.all_time_reward) || 0;
        }

        console.log(
          `[Earnings Summary API] Braiins - totalEarnings: ${totalBraiinsEarnings}, pendingPayouts: ${totalBraiinsPending}`,
        );
      } catch (error) {
        console.error(
          `[Earnings Summary API] Error fetching Braiins summary data:`,
          error,
        );
      }
    }

    const totalEarnings = totalLuxorEarnings + totalBraiinsEarnings;
    const totalPending = totalLuxorPending + totalBraiinsPending;

    // Determine which pools have a configured account
    const activePoolNames = [];
    if (luxorAuth) activePoolNames.push("Luxor");
    if (braiinsAuth) activePoolNames.push("Braiins");

    const response = {
      totalEarnings: {
        btc: parseFloat(totalEarnings.toFixed(8)),
      },
      pendingPayouts: {
        btc: parseFloat(totalPending.toFixed(8)),
      },
      currency: "BTC",
      dataSource:
        luxorAuth && braiinsAuth ? "both" : luxorAuth ? "luxor" : "braiins",
      timestamp: new Date().toISOString(),
      activePoolNames,
      poolBreakdown: {
        luxor: {
          totalEarnings: parseFloat(totalLuxorEarnings.toFixed(8)),
          pendingPayouts: parseFloat(totalLuxorPending.toFixed(8)),
        },
        braiins: {
          totalEarnings: parseFloat(totalBraiinsEarnings.toFixed(8)),
          pendingPayouts: parseFloat(totalBraiinsPending.toFixed(8)),
        },
      },
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
