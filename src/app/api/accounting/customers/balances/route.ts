import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

/**
 * GET /api/accounting/customers/balances
 *
 * Returns the available balance (sum of cost payments) for every CLIENT
 * customer, keyed by customer id. Customers with no cost payments default to 0.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access customer balances" },
        { status: 403 },
      );
    }

    const balancesByCustomer = await prisma.costPayment.groupBy({
      by: ["userId"],
      where: { isDeleted: false },
      _sum: { amount: true },
    });

    const balances: Record<string, number> = {};
    balancesByCustomer.forEach((entry) => {
      balances[entry.userId] = Number(entry._sum.amount || 0);
    });

    return NextResponse.json({ balances });
  } catch (error) {
    console.error("Failed to fetch customer balances:", error);
    return NextResponse.json(
      { error: "Failed to fetch customer balances" },
      { status: 500 },
    );
  }
}
