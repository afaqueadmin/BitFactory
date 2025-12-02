import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient } from "@/lib/luxor";
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

    // Get user's subaccount name from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { luxorSubaccountName: true },
    });

    if (!user?.luxorSubaccountName) {
      console.log(`[Transactions API] User ${userId} has no Luxor subaccount`);
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
          message: "No Luxor subaccount assigned",
        },
        { status: 200 },
      );
    }

    // Create Luxor client
    const client = createLuxorClient(user.luxorSubaccountName);

    // Build transaction type filter for Luxor API
    let transactionType: string | undefined;
    if (typeFilter === "credit") {
      transactionType = "credit";
    } else if (typeFilter === "debit") {
      transactionType = "debit";
    }
    // If "all", leave undefined (Luxor will return both)

    // Calculate date range - default to last 30 days
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const formatDate = (date: Date) => date.toISOString().split("T")[0];

    // Fetch transactions from Luxor API
    console.log(
      `[Transactions API] Fetching ${typeFilter} transactions - page ${page}, limit ${limit}, dates: ${formatDate(startDate)} to ${formatDate(endDate)}`,
    );
    const params: Record<string, string | number> = {
      page_number: page,
      page_size: limit,
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
      subaccount_names: user.luxorSubaccountName,
    };
    if (transactionType) {
      params.transaction_type = transactionType;
    }

    const luxorResponse = await client.getTransactions("BTC", params);

    // Calculate summary statistics
    let totalCredits = 0;
    let totalDebits = 0;

    for (const tx of luxorResponse.transactions) {
      if (tx.transaction_type === "credit") {
        totalCredits += tx.currency_amount;
      } else if (tx.transaction_type === "debit") {
        totalDebits += tx.currency_amount;
      }
    }

    const pagination = luxorResponse.pagination;
    const totalPages = Math.ceil(
      pagination.item_count / (pagination.page_size || limit),
    );

    const response = {
      transactions: luxorResponse.transactions.map((tx) => ({
        currency_type: tx.currency_type,
        date_time: tx.date_time,
        address_name: tx.address_name,
        subaccount_name: tx.subaccount_name,
        transaction_category: tx.transaction_category,
        currency_amount: parseFloat(tx.currency_amount.toFixed(8)),
        usd_equivalent: parseFloat(tx.usd_equivalent.toFixed(2)),
        transaction_id: tx.transaction_id,
        transaction_type: tx.transaction_type,
      })),
      pagination: {
        pageNumber: pagination.page_number,
        pageSize: pagination.page_size,
        totalItems: pagination.item_count,
        totalPages,
        hasNextPage: pagination.next_page_url !== null,
        hasPreviousPage: pagination.previous_page_url !== null,
      },
      summary: {
        totalCredits: parseFloat(totalCredits.toFixed(8)),
        totalDebits: parseFloat(totalDebits.toFixed(8)),
        netAmount: parseFloat((totalCredits - totalDebits).toFixed(8)),
      },
    };

    console.log(
      `[Transactions API] Returning ${luxorResponse.transactions.length} transactions`,
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
