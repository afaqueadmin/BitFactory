import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { Prisma } from "@prisma/client";

/**
 * Drill-down for the adminpanel "Monthly Revenue (30 days)" card.
 * Mirrors the exact where-clause used by /api/admin/dashboard for that
 * card's aggregate: type in [ELECTRICITY_CHARGES, ADJUSTMENT], createdAt
 * within the last 30 days. The card negates the raw sum (charges are
 * stored negative); this route returns both the raw and negated totals so
 * the itemized rows below can be reconciled against the displayed value.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userRole = decoded.role;
    } catch (error) {
      console.error(
        "[Admin Monthly Revenue] Token verification failed:",
        error,
      );
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access this data" },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "0", 10);
    const pageSize = parseInt(url.searchParams.get("pageSize") || "25", 10);

    if (page < 0 || pageSize < 1 || pageSize > 200) {
      return NextResponse.json(
        { error: "Invalid pagination parameters" },
        { status: 400 },
      );
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const where: Prisma.CostPaymentWhereInput = {
      type: { in: ["ELECTRICITY_CHARGES", "ADJUSTMENT"] },
      createdAt: { gte: thirtyDaysAgo },
    };

    const [electricitySum, adjustmentSum, totalCount, transactions] =
      await Promise.all([
        prisma.costPayment.aggregate({
          where: {
            type: "ELECTRICITY_CHARGES",
            createdAt: { gte: thirtyDaysAgo },
          },
          _sum: { amount: true },
        }),
        prisma.costPayment.aggregate({
          where: { type: "ADJUSTMENT", createdAt: { gte: thirtyDaysAgo } },
          _sum: { amount: true },
        }),
        prisma.costPayment.count({ where }),
        prisma.costPayment.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: page * pageSize,
          take: pageSize,
          include: {
            user: { select: { id: true, name: true, email: true } },
            invoice: { select: { invoiceNumber: true } },
          },
        }),
      ]);

    const sumElectricityCharges = Number(
      (electricitySum._sum.amount || 0).toFixed(2),
    );
    const sumAdjustment = Number((adjustmentSum._sum.amount || 0).toFixed(2));
    const rawTotal = Number((sumElectricityCharges + sumAdjustment).toFixed(2));
    const displayTotal = Number((rawTotal * -1).toFixed(2));

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          periodStart: thirtyDaysAgo.toISOString(),
          periodEnd: new Date().toISOString(),
          sumElectricityCharges,
          sumAdjustment,
          rawTotal,
          displayTotal,
        },
        transactions: transactions.map((t) => ({
          id: t.id,
          createdAt: t.createdAt,
          type: t.type,
          amount: t.amount,
          consumption: t.consumption,
          narration: t.narration,
          customer: t.user
            ? { id: t.user.id, name: t.user.name, email: t.user.email }
            : null,
          invoiceNumber: t.invoice?.invoiceNumber ?? null,
        })),
      },
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error) {
    console.error("[Admin Monthly Revenue] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch monthly revenue detail" },
      { status: 500 },
    );
  }
}
