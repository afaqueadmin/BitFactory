import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { createLuxorClient, WorkersResponse, LuxorError } from "@/lib/luxor";

interface WorkersStats {
  activeWorkers: number;
  inactiveWorkers: number;
  totalWorkers: number;
}

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
      console.error("[Workers Stats API] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Fetch the user's Luxor subaccount name from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { luxorSubaccountName: true },
    });

    if (!user || !user.luxorSubaccountName) {
      console.error(
        `[Workers Stats API] User ${userId} has no Luxor subaccount name configured`,
      );
      return NextResponse.json(
        { error: "Luxor subaccount not configured for user" },
        { status: 404 },
      );
    }

    const subaccountName = user.luxorSubaccountName;
    console.log(
      `[Workers Stats API] Fetching workers for subaccount: ${subaccountName}`,
    );

    // Create Luxor client - this will use Authorization header with API key
    // The client handles all URL building and headers properly
    const luxorClient = createLuxorClient(subaccountName);

    // Fetch workers from Luxor API using the client
    // Note: currency is a PATH parameter, not a query parameter
    // Must provide either subaccount_names or group_id as query parameter
    const workersData = await luxorClient.request<WorkersResponse>(
      "/pool/workers/BTC",
      {
        subaccount_names: subaccountName,
        page_number: 1,
        page_size: 1000,
      },
    );

    console.log(
      `[Workers Stats API] Fetched workers data - Active: ${workersData.total_active}, Inactive: ${workersData.total_inactive}`,
    );

    const stats: WorkersStats = {
      activeWorkers: workersData.total_active || 0,
      inactiveWorkers: workersData.total_inactive || 0,
      totalWorkers:
        (workersData.total_active || 0) + (workersData.total_inactive || 0),
    };

    return NextResponse.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Handle LuxorError specifically
    if (error instanceof LuxorError) {
      console.error(
        `[Workers Stats API] Luxor API error (${error.statusCode}): ${error.message}`,
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

    console.error("[Workers Stats API] Error fetching workers stats:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch workers stats",
      },
      { status: 500 },
    );
  }
}
