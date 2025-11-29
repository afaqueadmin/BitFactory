import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

interface DashboardStats {
  miners: {
    active: number;
    inactive: number;
  };
  spaces: {
    free: number;
    used: number;
  };
  customers: {
    active: number;
    inactive: number;
  };
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and check if user is admin
    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access dashboard stats" },
        { status: 403 },
      );
    }

    // Fetch miners statistics
    const activeMiners = await prisma.miner.count({
      where: { status: "ACTIVE" },
    });
    const inactiveMiners = await prisma.miner.count({
      where: { status: "INACTIVE" },
    });

    // Fetch spaces statistics
    const freeSpaces = await prisma.space.count({
      where: { status: "AVAILABLE" },
    });
    const usedSpaces = await prisma.space.count({
      where: { status: "OCCUPIED" },
    });

    // Fetch customers (users with role CLIENT) statistics
    // Count total clients as active, inactive would be those with no activity recently
    const totalCustomers = await prisma.user.count({
      where: { role: "CLIENT" },
    });

    // Fetch workers from Luxor API to get active/inactive status
    let luxorActiveWorkers = 0;
    let luxorInactiveWorkers = 0;

    try {
      // Fetch all workers from Luxor API with BTC currency (most common)
      const luxorResponse = await fetch(
        "https://app.luxor.tech/api/v1/pool/workers?currency=BTC&page_number=1&page_size=1000",
        {
          method: "GET",
          headers: {
            "X-API-Key": process.env.LUXOR_API_KEY || "",
          },
        },
      );

      if (luxorResponse.ok) {
        const luxorData = await luxorResponse.json();
        if (luxorData && Array.isArray(luxorData.workers)) {
          luxorActiveWorkers = luxorData.workers.filter(
            (w: { status: string }) => w.status === "ACTIVE",
          ).length;
          luxorInactiveWorkers = luxorData.workers.filter(
            (w: { status: string }) => w.status === "INACTIVE",
          ).length;
        }
      }
    } catch (error) {
      console.error("[Admin Dashboard] Error fetching Luxor workers:", error);
      // Fall back to customer count if Luxor API fails
      luxorActiveWorkers = totalCustomers;
    }

    const activeCustomers = luxorActiveWorkers || totalCustomers;
    const inactiveCustomers = luxorInactiveWorkers;

    const stats: DashboardStats = {
      miners: {
        active: activeMiners,
        inactive: inactiveMiners,
      },
      spaces: {
        free: freeSpaces,
        used: usedSpaces,
      },
      customers: {
        active: activeCustomers,
        inactive: inactiveCustomers,
      },
    };

    return NextResponse.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Admin Dashboard] Error fetching stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard statistics" },
      { status: 500 },
    );
  }
}
