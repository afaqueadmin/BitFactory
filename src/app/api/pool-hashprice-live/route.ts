import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { createLuxorClient, LuxorError } from "@/lib/luxor";

/**
 * GET /api/pool-hashprice-live
 *
 * Fetches LIVE real-time pool-wide hashprice from Luxor's summary endpoint
 * Uses 'higgs' subaccount for main pool data
 * Returns current hashprice (today's real-time value)
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token
    try {
      await verifyJwtToken(token);
    } catch (error) {
      console.error(
        "[Pool Hashprice Live API] Token verification failed:",
        error,
      );
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    console.log(
      `[Pool Hashprice Live API] Fetching live pool-wide hashprice from summary`,
    );

    // Create Luxor client using 'higgs' for pool-wide data
    const luxorClient = createLuxorClient("higgs");

    // Fetch live summary from Luxor API (includes current hashprice)
    const summaryData = await luxorClient.getSummary("BTC", {
      subaccount_names: "higgs",
    });

    const currentHashprice = summaryData.hashprice?.[0]?.value || 0;

    console.log(
      `[Pool Hashprice Live API] Live pool hashprice: ${currentHashprice}`,
    );

    return NextResponse.json({
      success: true,
      data: {
        hashprice: currentHashprice,
        hashrate_5m: summaryData.hashrate_5m,
        hashrate_24h: summaryData.hashrate_24h,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Handle LuxorError specifically
    if (error instanceof LuxorError) {
      console.error(
        `[Pool Hashprice Live API] Luxor API error (${error.statusCode}): ${error.message}`,
      );
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: error.statusCode },
      );
    }

    console.error("[Pool Hashprice Live API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch live hashprice",
      },
      { status: 500 },
    );
  }
}
