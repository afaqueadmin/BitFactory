import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and extract user ID
    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userRole = decoded.role;
    } catch (error) {
      console.error("[Cost Payments GET] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can search by customerId" },
        { status: 403 },
      );
    }

    const costPayments = await prisma.costPayment.aggregate({
      where: {
        type: "ELECTRICITY_CHARGES",
      },
      _sum: {
        amount: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        hostingRevenue: -1 * (costPayments._sum.amount || 0), // Negate the sum to reflect revenue (since costs are negative)
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching electricity charges:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch electricity charges",
      },
      { status: 500 },
    );
  }
}
