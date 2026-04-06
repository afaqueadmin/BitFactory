import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient } from "@/lib/luxor";
import { createBraiinsClient } from "@/lib/braiins";
import { groupMinersByPool, getLuxorGroups, getBraiinsGroups } from "@/lib/poolAggregation";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/wallet/transactions
 *
 * Fetches transaction history from Luxor API with optional filtering
 *
 * Query Parameters:
 *   - limit: Number of transactions per page (default: 50, max: 100)
 *   - page: Page number for pagination (default: 1)
 *   - type: Filter by transaction type - 'all', 'credit', 'debit' (default: 'all')
 *
 * Response:
 * {
 *   transactions: Transaction[],
 *   pagination: {
 *     pageNumber: number,
 *     pageSize: number,
 *     totalItems: number,
 *     totalPages: number,
 *     hasNextPage: boolean,
 *     hasPreviousPage: boolean
 *   },
 *   summary: {
 *     totalCredits: number (in BTC),
 *     totalDebits: number (in BTC),
 *     netAmount: number (in BTC)
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication via JWT token in cookies
    const token = request.cookies.get("token")?.value;
    if (!token) {
      console.log("[Transactions API] Unauthorized access attempt - no token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch (error) {
      console.log("[Transactions API] Invalid token:", error);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = decoded.userId;
    console.log(`[Transactions API] Fetching transactions for user: ${userId}`);

    // Get pagination and filter parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50"), 1),
      100,
    ); // Default 50, max 100
    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const typeFilter = (searchParams.get("type") || "all").toLowerCase();

    if (!["all", "credit", "debit"].includes(typeFilter)) {
      return NextResponse.json(
        { error: "Invalid type filter. Must be 'all', 'credit', or 'debit'" },
        { status: 400 },
      );
    }

    // Get all miners with pool and user info
    const miners = await prisma.miner.findMany({
      where: { userId },
      include: {
        pool: { select: { id: true, name: true } },
        user: { select: { luxorSubaccountName: true } },
      },
    });

    if (!miners || miners.length === 0) {
      console.log(`[Transactions API] User ${userId} has no miners`);
      return NextResponse.json(
        {
          transactions: [],
          pagination: {
            pageNumber: page,
            pageSize: limit,
            totalItems: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
          summary: {
            totalCredits: 0,
            totalDebits: 0,
            netAmount: 0,
          },
          poolBreakdown: {
            luxor: { count: 0, totalCredits: 0, totalDebits: 0 },
            braiins: { count: 0, totalCredits: 0, totalDebits: 0 },
          },
          message: "No miners assigned",
        },
        { status: 200 },
      );
    }

    // Get PoolAuth entries for this user (contains API keys)
    const poolAuths = await prisma.poolAuth.findMany({
      where: { userId },
      include: { pool: { select: { id: true, name: true } } },
    });

    // Create a map of poolId -> authKey for quick lookup
    const authKeyByPoolId = new Map<string, string>();
    poolAuths.forEach((auth) => {
      authKeyByPoolId.set(auth.poolId, auth.authKey);
    });

    // Group miners by pool
    const aggregation = groupMinersByPool(miners);
    const luxorGroups = getLuxorGroups(aggregation);
    const braiinsGroups = getBraiinsGroups(aggregation);

    // Calculate date range - default to last 30 days
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const formatDate = (date: Date) => date.toISOString().split("T")[0];

    // Build transaction type filter for Luxor API
    let transactionType: string | undefined;
    if (typeFilter === "credit") {
      transactionType = "credit";
    } else if (typeFilter === "debit") {
      transactionType = "debit";
    }

    // Collect all transactions from both pools
    const allTransactions: Array<any> = [];
    let luxorStats = { count: 0, totalCredits: 0, totalDebits: 0 };
    let braiinsStats = { count: 0, totalCredits: 0, totalDebits: 0 };

    // Fetch from Luxor groups
    for (const group of luxorGroups) {
      try {
        // Get the poolId from the first miner in the group to look up auth
        const minerWithPool = group.miners[0];
        const poolId = minerWithPool?.poolId;

        if (!poolId) {
          console.warn(
            `[Transactions API] Luxor group has no poolId, skipping`,
          );
          continue;
        }

        const authKey = authKeyByPoolId.get(poolId);
        if (!authKey) {
          console.warn(
            `[Transactions API] No auth key found for Luxor pool ${poolId}`,
          );
          continue;
        }

        console.log(
          `[Transactions API] Fetching Luxor transactions for auth key: ${authKey}`,
        );
        const client = createLuxorClient(authKey);
        const params: Record<string, string | number> = {
          page_number: 1,
          page_size: 100, // Get more items per page from Luxor
          start_date: formatDate(startDate),
          end_date: formatDate(endDate),
          subaccount_names: authKey,
        };
        if (transactionType) {
          params.transaction_type = transactionType;
        }

        const luxorResponse = await client.getTransactions("BTC", params);

        for (const tx of luxorResponse.transactions) {
          allTransactions.push({
            pool: "Luxor",
            currency_type: tx.currency_type,
            date_time: tx.date_time,
            address_name: tx.address_name,
            subaccount_name: tx.subaccount_name,
            transaction_category: tx.transaction_category,
            currency_amount: parseFloat(tx.currency_amount.toFixed(8)),
            usd_equivalent: parseFloat(tx.usd_equivalent.toFixed(2)),
            transaction_id: tx.transaction_id,
            transaction_type: tx.transaction_type,
          });

          if (tx.transaction_type === "credit") {
            luxorStats.totalCredits += tx.currency_amount;
          } else if (tx.transaction_type === "debit") {
            luxorStats.totalDebits += tx.currency_amount;
          }
        }
        luxorStats.count += luxorResponse.transactions.length;
        console.log(
          `[Transactions API] Got ${luxorResponse.transactions.length} Luxor transactions`,
        );
      } catch (error) {
        console.error(
          `[Transactions API] Error fetching Luxor transactions:`,
          error,
        );
      }
    }

    // Fetch from Braiins groups (use payouts as equivalent to transactions)
    for (const group of braiinsGroups) {
      try {
        // Get the poolId from the first miner in the group to look up auth
        const minerWithPool = group.miners[0];
        const poolId = minerWithPool?.poolId;

        if (!poolId) {
          console.warn(
            `[Transactions API] Braiins group has no poolId, skipping`,
          );
          continue;
        }

        const authKey = authKeyByPoolId.get(poolId);
        if (!authKey) {
          console.warn(
            `[Transactions API] No auth key found for Braiins pool ${poolId}`,
          );
          continue;
        }

        console.log(
          `[Transactions API] Fetching Braiins payouts for auth key: ${authKey}`,
        );
        const braiinsClient = createBraiinsClient(authKey);
        const braiinsResponse = await braiinsClient.getPayouts({
          from: formatDate(startDate),
          to: formatDate(endDate),
        });

        for (const payout of braiinsResponse?.btc?.payouts || []) {
          allTransactions.push({
            pool: "Braiins",
            currency_type: "BTC",
            date_time: payout.date,
            address_name: payout.transaction_id || "N/A",
            subaccount_name: authKey,
            transaction_category: "payout",
            currency_amount: parseFloat(payout.amount) || 0,
            usd_equivalent: 0, // Braiins API doesn't provide USD equivalent
            transaction_id: payout.transaction_id,
            transaction_type: "credit", // Payouts are always credits
          });

          braiinsStats.totalCredits += parseFloat(payout.amount) || 0;
        }
        braiinsStats.count += braiinsResponse?.btc?.payouts?.length ||0;
        console.log(
          `[Transactions API] Got ${braiinsResponse?.btc?.payouts?.length || 0} Braiins payouts for auth key: ${authKey}`,
        );
      } catch (error) {
        console.error(`[Transactions API] Error fetching Braiins payouts:`, error);
      }
    }

    // Sort all transactions by date (newest first)
    allTransactions.sort(
      (a, b) =>
        new Date(b.date_time).getTime() - new Date(a.date_time).getTime(),
    );

    // Apply pagination
    const totalItems = allTransactions.length;
    const totalPages = Math.ceil(totalItems / limit);
    const startIndex = (page - 1) * limit;
    const paginatedTransactions = allTransactions.slice(
      startIndex,
      startIndex + limit,
    );

    // Calculate summary statistics
    const totalCredits =
      luxorStats.totalCredits + braiinsStats.totalCredits;
    const totalDebits =
      luxorStats.totalDebits + braiinsStats.totalDebits;

    const response = {
      transactions: paginatedTransactions,
      pagination: {
        pageNumber: page,
        pageSize: limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      summary: {
        totalCredits: parseFloat(totalCredits.toFixed(8)),
        totalDebits: parseFloat(totalDebits.toFixed(8)),
        netAmount: parseFloat((totalCredits - totalDebits).toFixed(8)),
      },
      poolBreakdown: {
        luxor: {
          count: luxorStats.count,
          totalCredits: parseFloat(luxorStats.totalCredits.toFixed(8)),
          totalDebits: parseFloat(luxorStats.totalDebits.toFixed(8)),
          netAmount: parseFloat(
            (luxorStats.totalCredits - luxorStats.totalDebits).toFixed(8),
          ),
        },
        braiins: {
          count: braiinsStats.count,
          totalCredits: parseFloat(braiinsStats.totalCredits.toFixed(8)),
          totalDebits: parseFloat(braiinsStats.totalDebits.toFixed(8)),
          netAmount: parseFloat(
            (braiinsStats.totalCredits - braiinsStats.totalDebits).toFixed(8),
          ),
        },
      },
    };

    console.log(
      `[Transactions API] Returning ${paginatedTransactions.length} transactions (Luxor: ${luxorStats.count}, Braiins: ${braiinsStats.count})`,
    );

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[Transactions API] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to fetch transactions",
        details: errorMessage,
      },
      { status: 500 },
    );
  }
}
