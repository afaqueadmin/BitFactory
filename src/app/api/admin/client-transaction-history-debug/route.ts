import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { createLuxorClient } from "@/lib/luxor";

/**
 * GET /api/admin/client-transaction-history-debug
 *
 * Debug endpoint to see the raw Luxor API response
 * Shows transaction_type values and transaction breakdown
 *
 * ADMIN ONLY - Used for debugging case sensitivity and transaction type issues
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch (_error) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = decoded.role;
    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access this endpoint" },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const startDateParam = url.searchParams.get("start_date") || "2020-01-01";
    const endDateParam =
      url.searchParams.get("end_date") ||
      new Date().toISOString().split("T")[0];

    console.log(
      "[Client Transaction History Debug] Fetching raw Luxor data...",
    );

    // Get all Luxor PoolAuths
    const poolAuths = await prisma.poolAuth.findMany({
      where: {
        pool: { name: "Luxor" },
      },
      include: {
        pool: { select: { id: true, name: true } },
      },
    });

    if (poolAuths.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No Luxor pool auths found",
        authCount: 0,
      });
    }

    const luxorPoolId = poolAuths[0].poolId;
    const luxorClient = createLuxorClient(luxorPoolId);
    const luxorSubaccountNames = poolAuths.map((auth) => auth.authKey);

    // Fetch first page only for quick debug
    const debugParams: Record<string, string | number> = {
      subaccount_names: luxorSubaccountNames.join(","),
      start_date: startDateParam,
      end_date: endDateParam,
      page_number: 1,
      page_size: 100, // Smaller for debug
    };

    console.log("[Client Transaction History Debug] Calling Luxor API...");
    const luxorResponse = await luxorClient.getTransactions(
      "BTC",
      debugParams as Record<string, unknown>,
    );

    // Analyze transaction types
    const stats = {
      total: luxorResponse.transactions.length,
      byExactType: {} as Record<string, number>,
      byNormalizedType: {} as Record<string, number>,
      samples: {} as Record<
        string,
        {
          transaction_type: string;
          transaction_id: string;
          currency_amount: number;
          date_time: string;
          subaccount_name: string;
        }[]
      >,
    };

    for (const tx of luxorResponse.transactions) {
      const exactType = tx.transaction_type || "undefined";
      const normalized =
        tx.transaction_type?.toLowerCase().trim() || "undefined";

      // Count by type
      stats.byExactType[exactType] = (stats.byExactType[exactType] || 0) + 1;
      stats.byNormalizedType[normalized] =
        (stats.byNormalizedType[normalized] || 0) + 1;

      // Collect samples
      if (!stats.samples[exactType]) {
        stats.samples[exactType] = [];
      }
      if (stats.samples[exactType].length < 2) {
        stats.samples[exactType].push({
          transaction_type: tx.transaction_type,
          transaction_id: tx.transaction_id,
          currency_amount: tx.currency_amount,
          date_time: tx.date_time,
          subaccount_name: tx.subaccount_name,
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        debug: {
          message:
            "This shows raw Luxor API response used for debugging transaction_type issues",
          fetchedAt: new Date().toISOString(),
          dateRange: {
            start: startDateParam,
            end: endDateParam,
          },
          stats,
          pagination: luxorResponse.pagination,
          sampleTransactions: luxorResponse.transactions
            .slice(0, 3)
            .map((tx) => ({
              id: tx.transaction_id,
              type: tx.transaction_type,
              type_length: tx.transaction_type?.length,
              amount: tx.currency_amount,
              category: tx.transaction_category,
              date: tx.date_time,
            })),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Client Transaction History Debug] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
