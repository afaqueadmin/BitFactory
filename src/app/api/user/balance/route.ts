import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NON_BALANCE_PAYMENT_TYPES } from "@/lib/accounting/paymentTypes";
import { verifyJwtToken } from "@/lib/jwt";
import { simRoute } from "@/lib/simulation/context";
import { loadSimLedger } from "@/lib/simulation/ledgerStore";
import { ledgerBalance } from "@/lib/simulation/ledger";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and get user ID
    let userId: string;
    let userRole: string;
    let decoded;
    try {
      decoded = await verifyJwtToken(token);
      userId = decoded.userId;
      userRole = decoded.role;
    } catch (error) {
      console.error("Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const sim = await simRoute(decoded, async (ctx) =>
      NextResponse.json({
        balance: ledgerBalance(await loadSimLedger(ctx.userId)),
        userId: ctx.userId,
      }),
    );
    if (sim) return sim;

    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");
    if (customerId) {
      if (userRole === "FRANCHISEE") {
        const owned = await prisma.user.findFirst({
          where: { id: customerId, franchisee: { franchiseeId: userId } },
          select: { id: true },
        });
        if (!owned) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      } else if (!isStaffRole(userRole)) {
        return NextResponse.json(
          { error: "Only administrators can search by customerId" },
          { status: 403 },
        );
      }
      userId = customerId;
    }

    // Get sum of all amounts for this user from cost_payments table
    const result = await prisma.costPayment.aggregate({
      where: {
        userId,
        type: { notIn: NON_BALANCE_PAYMENT_TYPES },
        isDeleted: false,
      },
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
