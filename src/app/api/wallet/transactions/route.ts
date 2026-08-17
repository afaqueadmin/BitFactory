import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient } from "@/lib/luxor";
import { createBraiinsClient } from "@/lib/braiins";
import { prisma } from "@/lib/prisma";

/**
 * Transaction object from unified transaction history
 */
interface WalletTransaction {
  pool: "Luxor" | "Braiins";
  currency_type: string;
  date_time: string;
  address_name: string;
  subaccount_name: string;
  transaction_category: string;
  currency_amount: number;
  usd_equivalent: number;
  transaction_id: string;
  transaction_type: "credit" | "debit";
}

interface PoolStats {
  count: number;
  totalCredits: number;
  totalDebits: number;
  totalCreditsUsd: number;
  totalDebitsUsd: number;
}

const emptyStats = (): PoolStats => ({
  count: 0,
  totalCredits: 0,
  totalDebits: 0,
  totalCreditsUsd: 0,
  totalDebitsUsd: 0,
});

const accumulate = (stats: PoolStats, tx: WalletTransaction) => {
  stats.count += 1;
  if (tx.transaction_type === "credit") {
    stats.totalCredits += tx.currency_amount;
    stats.totalCreditsUsd += tx.usd_equivalent;
  } else {
    stats.totalDebits += tx.currency_amount;
    stats.totalDebitsUsd += tx.usd_equivalent;
  }
};

// ── DB helpers ──────────────────────────────────────────────────────────────
// PoolTransaction is the DB mirror of both pools' transaction ledgers,
// populated by scripts/backfill-pool-history.js. It's read directly here
// (rather than going through Luxor/Braiins) for "All Time"/custom ranges,
// and as a fallback when a live pool call fails for a preset range.

const dbRowToWalletTransaction = (
  row: {
    poolId: string;
    poolSubaccountId: string;
    externalTransactionId: string | null;
    transactionType: string;
    category: string | null;
    amount: unknown;
    usdEquivalent: unknown;
    addressName: string | null;
    occurredAt: Date;
  },
  poolNameById: Map<string, string>,
  subaccountNameById: Map<string, string>,
): WalletTransaction => ({
  pool: (poolNameById.get(row.poolId) as "Luxor" | "Braiins") || "Luxor",
  currency_type: "BTC",
  date_time: row.occurredAt.toISOString(),
  address_name: row.addressName || "",
  subaccount_name: subaccountNameById.get(row.poolSubaccountId) || "",
  transaction_category: row.category || "",
  currency_amount: parseFloat(Number(row.amount).toFixed(8)),
  usd_equivalent: row.usdEquivalent
    ? parseFloat(Number(row.usdEquivalent).toFixed(2))
    : 0,
  transaction_id: row.externalTransactionId || "",
  transaction_type: row.transactionType as "credit" | "debit",
});

async function fetchDbTransactions(params: {
  subaccountIds: string[];
  poolNameById: Map<string, string>;
  subaccountNameById: Map<string, string>;
  startDate: Date;
  endDate: Date;
  transactionType?: string;
}): Promise<WalletTransaction[]> {
  const {
    subaccountIds,
    poolNameById,
    subaccountNameById,
    startDate,
    endDate,
    transactionType,
  } = params;
  if (subaccountIds.length === 0) return [];

  const rows = await prisma.poolTransaction.findMany({
    where: {
      poolSubaccountId: { in: subaccountIds },
      occurredAt: { gte: startDate, lte: endDate },
      ...(transactionType ? { transactionType } : {}),
    },
    orderBy: { occurredAt: "desc" },
  });

  return rows.map((row) =>
    dbRowToWalletTransaction(row, poolNameById, subaccountNameById),
  );
}

/**
 * GET /api/wallet/transactions
 *
 * Fetches transaction history, sourced two different ways depending on the
 * requested range:
 *   - range=10d|20d|30d: fetched LIVE from Luxor/Braiins (matches how recent
 *     activity should read straight from the pool), falling back to
 *     PoolTransaction in the DB for whichever pool's live call fails (e.g.
 *     Luxor being down) rather than dropping that pool's data entirely.
 *   - no range (All Time, or a custom start_date/end_date): always read from
 *     PoolTransaction in the DB — no live calls at all, regardless of pool
 *     availability.
 *
 * Query Parameters:
 *   - limit: Number of transactions per page (default: 50, max: 100)
 *   - page: Page number for pagination (default: 1)
 *   - type: Filter by transaction type - 'all', 'credit', 'debit' (default: 'all')
 *   - range: '10d' | '20d' | '30d' — live-preferred preset window
 *   - start_date / end_date: custom DB-only range (ignored if `range` is set)
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

    let userId = decoded.userId;
    const userRole = decoded.role;
    console.log(`[Transactions API] Fetching transactions for user: ${userId}`);

    // Check for customerId in query params (for admin access)
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
      console.log(
        `[Transactions API] Override - fetching for customer: ${customerId}`,
      );
    }

    // Get pagination and filter parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50"), 1),
      100,
    ); // Default 50, max 100
    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const typeFilter = (searchParams.get("type") || "all").toLowerCase();
    // CSV export: same filters as the current view, but every matching row
    // instead of one page of them.
    const exportAll = searchParams.get("export") === "true";

    if (!["all", "credit", "debit"].includes(typeFilter)) {
      return NextResponse.json(
        { error: "Invalid type filter. Must be 'all', 'credit', or 'debit'" },
        { status: 400 },
      );
    }

    const rangeParam = searchParams.get("range");
    const isLivePreferred =
      rangeParam === "10d" || rangeParam === "20d" || rangeParam === "30d";

    // Which pool(s) to include. Filtering here (before pagination) matters:
    // a user's Luxor activity can be far more frequent than Braiins', so
    // paginating the merged, date-sorted list and THEN filtering by pool
    // client-side can hide real Braiins rows that exist a few pages back —
    // confirmed happening for a real account (4 Braiins transactions, all
    // older than the most recent 25 combined rows, so they never appeared
    // on page 1 once "pool=braiins" was selected).
    const poolParam = (searchParams.get("pool") || "total").toLowerCase();
    const wantLuxor = poolParam === "total" || poolParam === "luxor";
    const wantBraiins = poolParam === "total" || poolParam === "braiins";

    const userStartDate = searchParams.get("start_date");
    const userEndDate = searchParams.get("end_date");

    // Get PoolAuth entries for this user (contains API keys). Which pools
    // are active is determined directly from PoolAuth, not from
    // Miner.poolId - a Braiins/Luxor account is authenticated independently
    // of whether any Miner row happens to be tagged with that pool.
    const poolAuths = await prisma.poolAuth.findMany({
      where: { userId },
      include: { pool: { select: { id: true, name: true } } },
    });

    if (!poolAuths || poolAuths.length === 0) {
      console.log(`[Transactions API] User ${userId} has no pool accounts`);
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
            totalCreditsUsd: 0,
            totalDebitsUsd: 0,
            netAmountUsd: 0,
          },
          poolBreakdown: {
            luxor: {
              count: 0,
              totalCredits: 0,
              totalDebits: 0,
              netAmount: 0,
              totalCreditsUsd: 0,
              totalDebitsUsd: 0,
              netAmountUsd: 0,
            },
            braiins: {
              count: 0,
              totalCredits: 0,
              totalDebits: 0,
              netAmount: 0,
              totalCreditsUsd: 0,
              totalDebitsUsd: 0,
              netAmountUsd: 0,
            },
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

    // Calculate date range.
    let endDate: Date;
    let startDate: Date;

    if (isLivePreferred) {
      const days = rangeParam === "10d" ? 10 : rangeParam === "20d" ? 20 : 30;
      endDate = new Date();
      startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    } else if (userEndDate || userStartDate) {
      endDate = userEndDate ? new Date(userEndDate) : new Date();
      startDate = userStartDate
        ? new Date(userStartDate)
        : new Date("2020-01-01");
    } else {
      // "All Time" preset: no bounds supplied at all.
      endDate = new Date();
      startDate = new Date("2020-01-01");
    }

    const formatDate = (date: Date) => date.toISOString().split("T")[0];
    console.log(
      `[Transactions API] ${isLivePreferred ? "Live-preferred" : "DB-only"} date range: ${formatDate(startDate)} to ${formatDate(endDate)}`,
    );

    // Build transaction type filter
    let transactionType: string | undefined;
    if (typeFilter === "credit") {
      transactionType = "credit";
    } else if (typeFilter === "debit") {
      transactionType = "debit";
    }

    // Subaccounts are needed for both the DB-only path and the live-fallback
    // path, so resolve them once regardless of mode.
    const subaccounts = await prisma.poolSubaccount.findMany({
      where: { userId, pool: { name: { in: ["Luxor", "Braiins"] } } },
      include: { pool: { select: { id: true, name: true } } },
    });
    const poolNameById = new Map(
      subaccounts.map((s) => [s.pool.id, s.pool.name]),
    );
    const subaccountNameById = new Map(
      subaccounts.map((s) => [s.id, s.subaccountName]),
    );
    const luxorSubaccountIds = subaccounts
      .filter((s) => s.pool.name === "Luxor")
      .map((s) => s.id);
    const braiinsSubaccountIds = subaccounts
      .filter((s) => s.pool.name === "Braiins")
      .map((s) => s.id);

    // ── DB-only path: All Time / custom range, never calls Luxor/Braiins ──
    if (!isLivePreferred) {
      const scopedSubaccountIds = [
        ...(wantLuxor ? luxorSubaccountIds : []),
        ...(wantBraiins ? braiinsSubaccountIds : []),
      ];
      const allTransactions = await fetchDbTransactions({
        subaccountIds: scopedSubaccountIds,
        poolNameById,
        subaccountNameById,
        startDate,
        endDate,
        transactionType,
      });

      const luxorStats = emptyStats();
      const braiinsStats = emptyStats();
      for (const tx of allTransactions) {
        accumulate(tx.pool === "Braiins" ? braiinsStats : luxorStats, tx);
      }

      const totalItems = allTransactions.length;
      const totalPages = exportAll ? 1 : Math.ceil(totalItems / limit);
      const startIndex = (page - 1) * limit;
      const paginatedTransactions = exportAll
        ? allTransactions
        : allTransactions.slice(startIndex, startIndex + limit);

      const totalCredits = luxorStats.totalCredits + braiinsStats.totalCredits;
      const totalDebits = luxorStats.totalDebits + braiinsStats.totalDebits;
      const totalCreditsUsd =
        luxorStats.totalCreditsUsd + braiinsStats.totalCreditsUsd;
      const totalDebitsUsd =
        luxorStats.totalDebitsUsd + braiinsStats.totalDebitsUsd;

      console.log(
        `[Transactions API] DB-only: returning ${paginatedTransactions.length} of ${totalItems} transactions`,
      );

      return NextResponse.json(
        {
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
            totalCreditsUsd: parseFloat(totalCreditsUsd.toFixed(2)),
            totalDebitsUsd: parseFloat(totalDebitsUsd.toFixed(2)),
            netAmountUsd: parseFloat(
              (totalCreditsUsd - totalDebitsUsd).toFixed(2),
            ),
          },
          poolBreakdown: {
            luxor: {
              ...luxorStats,
              netAmount: parseFloat(
                (luxorStats.totalCredits - luxorStats.totalDebits).toFixed(8),
              ),
              netAmountUsd: parseFloat(
                (
                  luxorStats.totalCreditsUsd - luxorStats.totalDebitsUsd
                ).toFixed(2),
              ),
            },
            braiins: {
              ...braiinsStats,
              netAmount: parseFloat(
                (braiinsStats.totalCredits - braiinsStats.totalDebits).toFixed(
                  8,
                ),
              ),
              netAmountUsd: parseFloat(
                (
                  braiinsStats.totalCreditsUsd - braiinsStats.totalDebitsUsd
                ).toFixed(2),
              ),
            },
          },
          source: "db",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    // ── Live-preferred path: 10d/20d/30d, DB fallback per pool on failure ──
    const allTransactions: Array<WalletTransaction> = [];
    const luxorStats = emptyStats();
    const braiinsStats = emptyStats();

    // Fetch from Luxor
    if (luxorAuth && wantLuxor) {
      try {
        const authKey = luxorAuth.authKey;
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
          const wallet: WalletTransaction = {
            pool: "Luxor",
            currency_type: tx.currency_type,
            date_time: tx.date_time,
            address_name: tx.address_name,
            subaccount_name: tx.subaccount_name,
            transaction_category: tx.transaction_category,
            currency_amount: parseFloat(tx.currency_amount.toFixed(8)),
            usd_equivalent: parseFloat(tx.usd_equivalent.toFixed(2)),
            transaction_id: tx.transaction_id,
            transaction_type: tx.transaction_type as "credit" | "debit",
          };
          allTransactions.push(wallet);
          accumulate(luxorStats, wallet);
        }
        console.log(
          `[Transactions API] Got ${luxorResponse.transactions.length} Luxor transactions (live)`,
        );
      } catch (error) {
        console.error(
          `[Transactions API] Luxor live fetch failed, falling back to DB:`,
          error,
        );
        const dbTx = await fetchDbTransactions({
          subaccountIds: luxorSubaccountIds,
          poolNameById,
          subaccountNameById,
          startDate,
          endDate,
          transactionType,
        });
        for (const tx of dbTx) {
          allTransactions.push(tx);
          accumulate(luxorStats, tx);
        }
        console.log(
          `[Transactions API] Luxor DB fallback returned ${dbTx.length} transactions`,
        );
      }
    }

    // Fetch from Braiins (use payouts as equivalent to transactions)
    if (braiinsAuth && wantBraiins) {
      try {
        const authKey = braiinsAuth.authKey;
        console.log(
          `[Transactions API] Fetching Braiins payouts for auth key: ${authKey}`,
        );
        const braiinsClient = createBraiinsClient(authKey);
        const braiinsResponse = await braiinsClient.getPayouts({
          from: formatDate(startDate),
          to: formatDate(endDate),
        });

        const allPayouts = [
          ...(braiinsResponse?.onchain || []),
          ...(braiinsResponse?.lightning || []),
        ];

        for (const payout of allPayouts) {
          const btcAmount = payout.amount_sats / 100_000_000;
          const payoutDate = new Date(
            payout.resolved_at_ts * 1000,
          ).toISOString();

          const wallet: WalletTransaction = {
            pool: "Braiins",
            currency_type: "BTC",
            date_time: payoutDate,
            address_name: payout.destination || "N/A",
            subaccount_name: authKey,
            transaction_category: "payout",
            currency_amount: btcAmount,
            usd_equivalent: 0,
            transaction_id: payout.tx_id || "",
            transaction_type: "credit",
          };
          allTransactions.push(wallet);
          accumulate(braiinsStats, wallet);
        }
        console.log(
          `[Transactions API] Got ${allPayouts.length} Braiins payouts (live)`,
        );
      } catch (error) {
        console.error(
          `[Transactions API] Braiins live fetch failed, falling back to DB:`,
          error,
        );
        const dbTx = await fetchDbTransactions({
          subaccountIds: braiinsSubaccountIds,
          poolNameById,
          subaccountNameById,
          startDate,
          endDate,
          transactionType,
        });
        for (const tx of dbTx) {
          allTransactions.push(tx);
          accumulate(braiinsStats, tx);
        }
        console.log(
          `[Transactions API] Braiins DB fallback returned ${dbTx.length} transactions`,
        );
      }
    }

    // Sort all transactions by date (newest first)
    allTransactions.sort(
      (a, b) =>
        new Date(b.date_time).getTime() - new Date(a.date_time).getTime(),
    );

    // Apply pagination
    const totalItems = allTransactions.length;
    const totalPages = exportAll ? 1 : Math.ceil(totalItems / limit);
    const startIndex = (page - 1) * limit;
    const paginatedTransactions = exportAll
      ? allTransactions
      : allTransactions.slice(startIndex, startIndex + limit);

    const totalCredits = luxorStats.totalCredits + braiinsStats.totalCredits;
    const totalDebits = luxorStats.totalDebits + braiinsStats.totalDebits;
    const totalCreditsUsd =
      luxorStats.totalCreditsUsd + braiinsStats.totalCreditsUsd;
    const totalDebitsUsd =
      luxorStats.totalDebitsUsd + braiinsStats.totalDebitsUsd;

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
        totalCreditsUsd: parseFloat(totalCreditsUsd.toFixed(2)),
        totalDebitsUsd: parseFloat(totalDebitsUsd.toFixed(2)),
        netAmountUsd: parseFloat((totalCreditsUsd - totalDebitsUsd).toFixed(2)),
      },
      poolBreakdown: {
        luxor: {
          ...luxorStats,
          netAmount: parseFloat(
            (luxorStats.totalCredits - luxorStats.totalDebits).toFixed(8),
          ),
          netAmountUsd: parseFloat(
            (luxorStats.totalCreditsUsd - luxorStats.totalDebitsUsd).toFixed(2),
          ),
        },
        braiins: {
          ...braiinsStats,
          netAmount: parseFloat(
            (braiinsStats.totalCredits - braiinsStats.totalDebits).toFixed(8),
          ),
          netAmountUsd: parseFloat(
            (
              braiinsStats.totalCreditsUsd - braiinsStats.totalDebitsUsd
            ).toFixed(2),
          ),
        },
      },
      source: "live",
    };

    console.log(
      `[Transactions API] Returning ${paginatedTransactions.length} transactions (Luxor: ${luxorStats.count}, Braiins: ${braiinsStats.count})`,
    );

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
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
