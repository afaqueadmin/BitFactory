import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and extract user ID and role
    // let userId: string;
    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      // userId = decoded.userId;
      userRole = decoded.role;
    } catch (error) {
      console.error("[Customer Balance GET] Token verification failed:", error);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin or super admin
    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Query cost_payments table and aggregate by userId
    const costPayments = await prisma.costPayment.groupBy({
      by: ["userId"],
      _sum: {
        amount: true,
      },
    });

    // Calculate aggregates
    let totalPositiveBalance = 0;
    let totalNegativeBalance = 0;
    let positiveCustomerCount = 0;
    let negativeCustomerCount = 0;

    costPayments.forEach((payment) => {
      const aggregatedAmount = payment._sum.amount || 0;

      if (aggregatedAmount > 0) {
        totalPositiveBalance += aggregatedAmount;
        positiveCustomerCount += 1;
      } else if (aggregatedAmount < 0) {
        totalNegativeBalance += aggregatedAmount;
        negativeCustomerCount += 1;
      }
    });

    console.log(
      `[Customer Balance GET] Aggregated balances - Positive: ${totalPositiveBalance}, Negative: ${totalNegativeBalance}`,
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          totalPositiveBalance,
          totalNegativeBalance,
          positiveCustomerCount,
          negativeCustomerCount,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Customer Balance GET] Error fetching balance:", error);
    return NextResponse.json(
      { error: "Failed to fetch customer balance" },
      { status: 500 },
    );
  }
}
