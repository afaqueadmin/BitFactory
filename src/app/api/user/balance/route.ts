import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and get user ID
    let userId: string;
    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
      userRole = decoded.role;
    } catch (error) {
      console.error("Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");
    if (customerId) {
      if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Only administrators can search by customerId" },
          { status: 403 },
        );
      }
      userId = customerId;
    }

    // Get sum of all amounts for this user from cost_payments table
    const result = await prisma.costPayment.aggregate({
      where: { userId },
      _sum: {
        amount: true,
      },
    });

    const balance = result._sum.amount || 0;

    return NextResponse.json({
      balance,
      userId,
    });
  } catch (error) {
    console.error("Error getting balance:", error);
    return NextResponse.json(
      { error: "Failed to get balance" },
      { status: 500 },
    );
  }
}
