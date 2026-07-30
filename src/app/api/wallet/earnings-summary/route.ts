import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient } from "@/lib/luxor";
import { createBraiinsClient } from "@/lib/braiins";
import {
  groupMinersByPool,
  getLuxorGroups,
  getBraiinsGroups,
} from "@/lib/poolAggregation";
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

    // Get all miners with pool info
    const miners = await prisma.miner.findMany({
      where: { userId },
      include: {
        pool: { select: { id: true, name: true } },
      },
    });

    // Get PoolAuth entries for this user (contains API keys) - this includes
    // auth for pools the user is no longer actively mining on (e.g. a
    // customer who moved from Braiins back to Luxor but still has a balance
    // sitting on Braiins), so balances must be fetched for ALL of these, not
    // just pools with currently assigned miners.
    const poolAuths = await prisma.poolAuth.findMany({
      where: { userId },
      include: { pool: { select: { id: true, name: true } } },
    });

    if ((!miners || miners.length === 0) && poolAuths.length === 0) {
      console.log(
        `[Earnings Summary API] User ${userId} has no miners and no pool history`,
      );
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
          message: "No miners assigned",
        },
        { status: 200 },
      );
    }

    const luxorAuths = poolAuths.filter((auth) => auth.pool.name === "Luxor");
    const braiinsAuths = poolAuths.filter(
      (auth) => auth.pool.name === "Braiins",
    );

    // Group current miners by pool - used only to report which pool(s) the
    // customer is actively mining on right now (activePoolNames below),
    // separate from which pools contribute to the balance totals.
    const aggregation = groupMinersByPool(miners);
    const luxorGroups = getLuxorGroups(aggregation);
    const braiinsGroups = getBraiinsGroups(aggregation);

    let totalLuxorEarnings = 0;
    let totalLuxorPending = 0;
    let totalBraiinsEarnings = 0;
    let totalBraiinsPending = 0;

    const endDate = new Date();
    const startDate = new Date("2020-01-01");
    const formatDate = (date: Date) => date.toISOString().split("T")[0];

    // Fetch from every Luxor pool the user has ever had credentials for
    for (const auth of luxorAuths) {
      try {
        const authKey = auth.authKey;

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

    // Fetch from every Braiins pool the user has ever had credentials for
    for (const auth of braiinsAuths) {
      try {
        const authKey = auth.authKey;

        console.log(
          `[Earnings Summary API] Fetching Braiins data for auth key: ${authKey}`,
        );
        const braiinsClient = createBraiinsClient(authKey);

        // Get user profile to fetch current pending balance
        const profile = await braiinsClient.getUserProfile();
        totalBraiinsPending += parseFloat(profile.btc.current_balance) || 0;

        // Get all payouts to calculate total earnings
        const payouts = await braiinsClient.getPayouts({
          from: formatDate(startDate),
          to: formatDate(endDate),
        });

        // Process on-chain payouts (Braiins returns amount_sats, convert to BTC)
        if (payouts?.onchain) {
          for (const payout of payouts.onchain) {
            // Convert satoshis to BTC: 1 BTC = 100,000,000 satoshis
            const btcAmount = payout.amount_sats / 100_000_000;
            totalBraiinsEarnings += btcAmount;
          }
        }

        // Process Lightning payouts if present
        if (payouts?.lightning) {
          for (const payout of payouts.lightning) {
            const btcAmount = payout.amount_sats / 100_000_000;
            totalBraiinsEarnings += btcAmount;
          }
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

    // Determine which pools have miners
    const activePoolNames = [];
    if (luxorGroups.length > 0) activePoolNames.push("Luxor");
    if (braiinsGroups.length > 0) activePoolNames.push("Braiins");

    const response = {
      totalEarnings: {
        btc: parseFloat(totalEarnings.toFixed(8)),
      },
      pendingPayouts: {
        btc: parseFloat(totalPending.toFixed(8)),
      },
      currency: "BTC",
      dataSource:
        luxorAuths.length > 0 && braiinsAuths.length > 0
          ? "both"
          : luxorAuths.length > 0
            ? "luxor"
            : braiinsAuths.length > 0
              ? "braiins"
              : "none",
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
