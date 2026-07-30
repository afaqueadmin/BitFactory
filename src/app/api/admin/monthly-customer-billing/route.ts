import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { buildOrderBy, parseMonthlyRevenueQuery } from "./query";

/**
 * Drill-down for the adminpanel "Monthly Revenue (30 days)" card.
 * With no filters applied, the summary matches the card exactly: type in
 * [ELECTRICITY_CHARGES, ADJUSTMENT], createdAt within the last 30 days,
 * summed then sign-flipped for display. When date/customer/type filters are
 * applied, the summary is recomputed over that same filtered subset (via
 * the same `where` used for the transaction list), so it no longer matches
 * the card — it reflects exactly what's listed below.
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

    if (page < 0 || pageSize < 1 || pageSize > 9999) {
      return NextResponse.json(
        { error: "Invalid pagination parameters" },
        { status: 400 },
      );
    }

    const { sortBy, sortOrder, where, effectiveStart, effectiveEnd } =
      parseMonthlyRevenueQuery(url);

    // Summary buckets use the exact same where-clause as the transaction
    // list (date range + customer filter), each intersected with a single
    // type — so the summary always reflects the filtered subset currently
    // being listed below, not the fixed unfiltered 30-day card total.
    const [electricitySum, adjustmentSum, totalCount, transactions] =
      await Promise.all([
        prisma.costPayment.aggregate({
          where: { AND: [where, { type: "ELECTRICITY_CHARGES" }] },
          _sum: { amount: true },
        }),
        prisma.costPayment.aggregate({
          where: { AND: [where, { type: "ADJUSTMENT" }] },
          _sum: { amount: true },
        }),
        prisma.costPayment.count({ where }),
        prisma.costPayment.findMany({
          where,
          orderBy: buildOrderBy(sortBy, sortOrder),
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
          periodStart: effectiveStart.toISOString(),
          periodEnd: effectiveEnd.toISOString(),
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
