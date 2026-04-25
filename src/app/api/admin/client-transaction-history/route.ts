import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { createLuxorClient } from "@/lib/luxor";
import { createBraiinsClient } from "@/lib/braiins";

/**
 * Transaction object with customer information
 */
interface ClientTransaction {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  pool: "Luxor" | "Braiins";
  date_time: string;
  transaction_type: "credit" | "debit";
  currency_amount: number;
  usd_equivalent: number;
  transaction_category: string;
  transaction_id: string;
  subaccount_name: string;
}

interface Customer {
  id: string;
  email: string;
  name: string | null;
  companyName: string | null;
}

// Mapping of subaccount_name to customer for transaction association
interface SubaccountCustomerMap {
  [subaccountName: string]: string; // Maps subaccount_name to customerId
}

/**
 * GET /api/admin/client-transaction-history
 *
 * Fetches transaction history for all customers or selected customers
 * (admin-only endpoint)
 *
 * Query Parameters:
 *   - customerIds: Comma-separated customer IDs (optional, defaults to all)
 *   - pool: Filter by pool - 'all', 'luxor', 'braiins' (default: 'all')
 *   - type: Filter by transaction type - 'all', 'credit', 'debit' (default: 'all')
 *   - start_date: ISO date string for transaction start (optional, default: 2020-01-01)
 *   - end_date: ISO date string for transaction end (optional, default: today)
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     transactions: ClientTransaction[],
 *     summary: {
 *       totalCredits: number,
 *       totalDebits: number,
 *       netAmount: number,
 *       totalCreditsUsd: number,
 *       totalDebitsUsd: number,
 *       netAmountUsd: number
 *     },
 *     poolBreakdown: {
 *       luxor: PoolStats,
 *       braiins: PoolStats
 *     },
 *     customers: Customer[]
 *   },
 *   timestamp: string,
 *   error?: string
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication and authorization
    const token = request.cookies.get("token")?.value;
    if (!token) {
      console.log("[Client Transaction History API] Unauthorized - no token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch (error) {
      console.log("[Client Transaction History API] Invalid token:", error);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only ADMIN and SUPER_ADMIN can access this endpoint
    const userRole = decoded.role;
    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      console.log(
        `[Client Transaction History API] Forbidden - user role: ${userRole}`,
      );
      return NextResponse.json(
        { error: "Only administrators can access this endpoint" },
        { status: 403 },
      );
    }

    console.log("[Client Transaction History API] Fetching all customers...");

    // Get query parameters
    const url = new URL(request.url);
    const customerIdsParam = url.searchParams.get("customerIds");
    const poolFilter = (url.searchParams.get("pool") || "all").toLowerCase();
    const typeFilter = (url.searchParams.get("type") || "all").toLowerCase();
    const startDateParam = url.searchParams.get("start_date") || "2020-01-01";
    const endDateParam =
      url.searchParams.get("end_date") ||
      new Date().toISOString().split("T")[0];

    // Validate filters
    if (!["all", "luxor", "braiins"].includes(poolFilter)) {
      return NextResponse.json(
        {
          error: "Invalid pool filter. Must be 'all', 'luxor', or 'braiins'",
        },
        { status: 400 },
      );
    }

    if (!["all", "credit", "debit"].includes(typeFilter)) {
      return NextResponse.json(
        {
          error: "Invalid type filter. Must be 'all', 'credit', or 'debit'",
        },
        { status: 400 },
      );
    }

    // Fetch all customers (or filter to specific IDs)
    const customerWhere: Prisma.UserWhereInput = {
      role: "CLIENT",
    };
    if (customerIdsParam) {
      const customerIds = customerIdsParam.split(",").filter((id) => id.trim());
      customerWhere.id = { in: customerIds };
    }

    const customers = await prisma.user.findMany({
      where: customerWhere,
      select: {
        id: true,
        email: true,
        name: true,
        companyName: true,
      },
    });

    console.log(
      `[Client Transaction History API] Found ${customers.length} customers`,
    );

    if (customers.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: {
            transactions: [],
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
            customers: [],
          },
          timestamp: new Date().toISOString(),
        },
        { status: 200 },
      );
    }

    // Fetch PoolAuth records for selected customers
    console.log(
      `[Client Transaction History API] Fetching PoolAuth records for customers`,
    );

    const poolAuths = await prisma.poolAuth.findMany({
      where: {
        userId: { in: customers.map((c) => c.id) },
      },
      include: {
        pool: { select: { id: true, name: true } },
      },
    });

    console.log(
      `[Client Transaction History API] Found ${poolAuths.length} PoolAuth records`,
    );

    // Group pool auths by pool type
    const luxorAuths = poolAuths.filter(
      (pa) => pa.pool.name.toLowerCase() === "luxor",
    );
    const braiinsAuths = poolAuths.filter(
      (pa) => pa.pool.name.toLowerCase() === "braiins",
    );

    // Create mapping of customer ID for quick lookup
    const customerMap = new Map<string, Customer>();
    customers.forEach((c) => customerMap.set(c.id, c));

    // Create mapping of authKey (subaccount_name) to customer ID for result association
    const subaccountToCustomer: SubaccountCustomerMap = {};
    luxorAuths.forEach((auth) => {
      subaccountToCustomer[auth.authKey] = auth.userId;
    });
    braiinsAuths.forEach((auth) => {
      subaccountToCustomer[auth.authKey] = auth.userId;
    });

    const allTransactions: ClientTransaction[] = [];
    const summaryStats = {
      totalCredits: 0,
      totalDebits: 0,
      netAmount: 0,
      totalCreditsUsd: 0,
      totalDebitsUsd: 0,
      netAmountUsd: 0,
    };

    const poolStats = {
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
    };

    // ========================================================================
    // FETCH LUXOR TRANSACTIONS (OPTIMIZED: ONE API CALL FOR ALL SUBACCOUNTS)
    // ========================================================================

    if (luxorAuths.length > 0 && poolFilter !== "braiins") {
      try {
        const luxorSubaccountNames = luxorAuths.map((auth) => auth.authKey);

        console.log(
          `[Client Transaction History API] Fetching Luxor transactions for ${luxorSubaccountNames.length} subaccounts in ONE API call`,
        );

        // Use first auth's pool ID to create Luxor client
        const luxorPoolId = luxorAuths[0].poolId;
        const luxorClient = createLuxorClient(luxorPoolId);

        const luxorParams: Record<string, string | number> = {
          subaccount_names: luxorSubaccountNames.join(","),
          start_date: startDateParam,
          end_date: endDateParam,
          page_number: 1,
          page_size: 500, // Fetch more to get complete history
        };

        if (typeFilter !== "all") {
          luxorParams.transaction_type = typeFilter;
        }

        const luxorResponse = await luxorClient.getTransactions(
          "BTC",
          luxorParams as Record<string, unknown>,
        );

        console.log(
          `[Client Transaction History API] Got ${luxorResponse.transactions.length} Luxor transactions`,
        );

        // Process Luxor transactions
        for (const tx of luxorResponse.transactions) {
          // Find the customer for this transaction via subaccount_name
          const customerId = subaccountToCustomer[tx.subaccount_name];
          if (!customerId) {
            console.warn(
              `[Client Transaction History API] WARNING: Received transaction for unknown subaccount: ${tx.subaccount_name}`,
            );
            continue;
          }

          const customer = customerMap.get(customerId);
          if (!customer) {
            console.warn(
              `[Client Transaction History API] WARNING: Customer ${customerId} not in map`,
            );
            continue;
          }

          // Apply pool filter (should already be Luxor, but verify)
          if (poolFilter !== "all" && poolFilter !== "luxor") {
            continue;
          }

          const clientTx: ClientTransaction = {
            id: `${customerId}-${tx.transaction_id}`,
            customerId,
            customerName: customer.name || customer.email,
            customerEmail: customer.email,
            pool: "Luxor",
            date_time: tx.date_time,
            transaction_type: tx.transaction_type as "credit" | "debit",
            currency_amount: parseFloat(tx.currency_amount.toFixed(8)),
            usd_equivalent: parseFloat(tx.usd_equivalent.toFixed(2)),
            transaction_category: tx.transaction_category,
            transaction_id: tx.transaction_id,
            subaccount_name: tx.subaccount_name,
          };

          allTransactions.push(clientTx);

          // Update summary stats
          if (tx.transaction_type === "credit") {
            summaryStats.totalCredits += tx.currency_amount;
            summaryStats.totalCreditsUsd += tx.usd_equivalent;
          } else if (tx.transaction_type === "debit") {
            summaryStats.totalDebits += tx.currency_amount;
            summaryStats.totalDebitsUsd += tx.usd_equivalent;
          }

          // Update pool-specific stats
          poolStats.luxor.count++;
          if (tx.transaction_type === "credit") {
            poolStats.luxor.totalCredits += tx.currency_amount;
            poolStats.luxor.totalCreditsUsd += tx.usd_equivalent;
          } else if (tx.transaction_type === "debit") {
            poolStats.luxor.totalDebits += tx.currency_amount;
            poolStats.luxor.totalDebitsUsd += tx.usd_equivalent;
          }
        }
      } catch (error) {
        console.error(
          `[Client Transaction History API] Error fetching Luxor transactions:`,
          error,
        );
      }
    }

    // ========================================================================
    // FETCH BRAIINS PAYOUTS (REQUIRES MULTIPLE CALLS - API LIMITATION)
    // ========================================================================

    if (braiinsAuths.length > 0 && poolFilter !== "luxor") {
      console.log(
        `[Client Transaction History API] Fetching Braiins payouts for ${braiinsAuths.length} customers (one call per customer)`,
      );

      for (const auth of braiinsAuths) {
        try {
          const customerId = auth.userId;
          const customer = customerMap.get(customerId);

          if (!customer) {
            console.warn(
              `[Client Transaction History API] Braiins: Customer ${customerId} not in map`,
            );
            continue;
          }

          console.log(
            `[Client Transaction History API] Fetching Braiins payouts for customer: ${customerId}`,
          );

          const braiinsClient = createBraiinsClient(auth.authKey);
          const braiinsResponse = await braiinsClient.getPayouts({
            from: startDateParam,
            to: endDateParam,
          });

          // Process on-chain and lightning payouts
          const allPayouts = [
            ...(braiinsResponse?.onchain || []),
            ...(braiinsResponse?.lightning || []),
          ];

          console.log(
            `[Client Transaction History API] Got ${allPayouts.length} Braiins payouts for customer ${customerId}`,
          );

          for (const payout of allPayouts) {
            // Apply type filter (Braiins payouts are always credits)
            if (typeFilter === "debit") {
              continue;
            }

            // Convert satoshis to BTC
            const btcAmount = payout.amount_sats / 100_000_000;

            // Convert Unix timestamp to ISO date string
            const payoutDate = new Date(
              payout.resolved_at_ts * 1000,
            ).toISOString();

            const clientTx: ClientTransaction = {
              id: `${customerId}-${payout.tx_id || "pending"}`,
              customerId,
              customerName: customer.name || customer.email,
              customerEmail: customer.email,
              pool: "Braiins",
              date_time: payoutDate,
              transaction_type: "credit",
              currency_amount: btcAmount,
              usd_equivalent: 0, // Braiins API doesn't provide USD equivalent
              transaction_category: "payout",
              transaction_id: payout.tx_id || "pending",
              subaccount_name: auth.authKey,
            };

            // Apply pool filter (should already be Braiins, verify)
            if (poolFilter !== "all" && poolFilter !== "braiins") {
              continue;
            }

            allTransactions.push(clientTx);

            // Update summary stats
            summaryStats.totalCredits += btcAmount;
            // Note: totalCreditsUsd remains at prior value as Braiins API doesn't provide USD

            // Update pool-specific stats
            poolStats.braiins.count++;
            poolStats.braiins.totalCredits += btcAmount;
          }
        } catch (error) {
          console.error(
            `[Client Transaction History API] Error fetching Braiins payouts for customer ${auth.userId}:`,
            error,
          );
          // Continue with next customer instead of failing
        }
      }
    }

    // Calculate net amounts
    summaryStats.netAmount =
      summaryStats.totalCredits - summaryStats.totalDebits;
    summaryStats.netAmountUsd =
      summaryStats.totalCreditsUsd - summaryStats.totalDebitsUsd;

    poolStats.luxor.netAmount =
      poolStats.luxor.totalCredits - poolStats.luxor.totalDebits;
    poolStats.luxor.netAmountUsd =
      poolStats.luxor.totalCreditsUsd - poolStats.luxor.totalDebitsUsd;

    poolStats.braiins.netAmount =
      poolStats.braiins.totalCredits - poolStats.braiins.totalDebits;
    poolStats.braiins.netAmountUsd =
      poolStats.braiins.totalCreditsUsd - poolStats.braiins.totalDebitsUsd;

    console.log(
      `[Client Transaction History API] Fetched ${allTransactions.length} total transactions`,
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          transactions: allTransactions,
          summary: summaryStats,
          poolBreakdown: poolStats,
          customers,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Client Transaction History API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
