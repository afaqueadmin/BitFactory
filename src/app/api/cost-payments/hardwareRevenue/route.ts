import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["dashboard.view"]);
    if ("response" in auth) return auth.response;

    const [costPayments, credits] = await Promise.all([
      prisma.costPayment.aggregate({
        where: {
          // Hardware revenue covers both sales and repair payments.
          type: { in: ["HARDWARE_SALES", "HARDWARE_REPAIR"] },
          isDeleted: false,
        },
        _sum: {
          amount: true,
        },
      }),
      prisma.memo.aggregate({
        where: { category: "HARDWARE", status: "ISSUED" },
        _sum: { amount: true },
      }),
    ]);

    const paymentsTotal = costPayments._sum.amount || 0;
    const creditTotal = credits._sum.amount ? Number(credits._sum.amount) : 0;

    return NextResponse.json(
      {
        success: true,
        hardwareRevenue: paymentsTotal - creditTotal,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching hardware sales revenue:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch hardware sales revenue",
      },
      { status: 500 },
    );
  }
}
