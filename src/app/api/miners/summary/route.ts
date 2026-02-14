import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { createLuxorClient, LuxorError } from "@/lib/luxor";

/**
 * GET /api/miners/summary
 *
 * Fetches pool summary statistics from Luxor including:
 * - Current hashprice
 * - Current hashrate (5m, 24h)
 * - Active miners count
 * - Revenue and balance info
 *
 * Returns Luxor's SummaryResponse directly to client
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and extract user ID
    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("[Miners Summary API] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Fetch the user's Luxor subaccount name and role from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { luxorSubaccountName: true, role: true },
    });

    console.log(
      `[Miners Summary API] User lookup - ID: ${userId}, Found: ${!!user}, Role: ${user?.role}, Data:`,
      user,
    );

    // Use 'higgs' subaccount for admin users, otherwise use user's configured subaccount
    let subaccountName: string;
    if (user?.role === "ADMIN") {
      subaccountName = "higgs";
      console.log(
        `[Miners Summary API] Admin user detected - using 'higgs' subaccount`,
      );
    } else if (user?.luxorSubaccountName) {
      subaccountName = user.luxorSubaccountName;
    } else {
      console.error(
        `[Miners Summary API] User ${userId} has no Luxor subaccount name configured. User data:`,
        user,
      );
      return NextResponse.json(
        { error: "Luxor subaccount not configured for user" },
        { status: 404 },
      );
    }
    console.log(
      `[Miners Summary API] Fetching summary for subaccount: ${subaccountName}`,
    );

    // Create Luxor client
    const luxorClient = createLuxorClient(subaccountName);

    // Fetch summary from Luxor API
    // The getSummary method returns aggregated pool statistics including hashprice
    const summaryData = await luxorClient.getSummary("BTC", {
      subaccount_names: subaccountName,
    });

    console.log(
      `[Miners Summary API] Fetched summary - Hashprice: ${summaryData.hashprice?.[0]?.value || "N/A"}, Hashrate 24h: ${summaryData.hashrate_24h}`,
    );

    return NextResponse.json({
      success: true,
      data: summaryData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Handle LuxorError specifically
    if (error instanceof LuxorError) {
      console.error(
        `[Miners Summary API] Luxor API error (${error.statusCode}): ${error.message}`,
      );
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          details: error.errorDetails,
        },
        { status: error.statusCode },
      );
    }

    console.error("[Miners Summary API] Error fetching summary:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch summary",
      },
      { status: 500 },
    );
  }
}
