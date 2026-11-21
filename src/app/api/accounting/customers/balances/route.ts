import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { NON_BALANCE_PAYMENT_TYPES } from "@/lib/accounting/paymentTypes";

/**
 * GET /api/accounting/customers/balances
 *
 * Returns the available balance (sum of cost payments) for every CLIENT
 * customer, keyed by customer id. Customers with no cost payments default to 0.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, [
      "invoicing.view",
      "invoicing.create",
      "invoicing.edit",
    ]);
    if ("response" in auth) return auth.response;

    const balancesByCustomer = await prisma.costPayment.groupBy({
      by: ["userId"],
      where: { isDeleted: false, type: { notIn: NON_BALANCE_PAYMENT_TYPES } },
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
