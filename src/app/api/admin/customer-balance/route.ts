import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { buildOrderBy, parseCustomerBalanceQuery } from "./query";

/**
 * Drill-down for the adminpanel "Total Customer Balance" card. With no
 * filters applied, the summary matches the card exactly: type !=
 * HARDWARE_SALES, user not soft-deleted, all-time (no createdAt filter). No
 * sign flip is applied — this is a net ledger balance, not a revenue
 * figure. When date/customer/type filters are applied, the summary is
 * recomputed over that same filtered subset (via the same `where` used for
 * the transaction list), so it no longer matches the card — it reflects
 * exactly what's listed below.
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
        "[Admin Customer Balance] Token verification failed:",
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

    const { sortBy, sortOrder, where } = parseCustomerBalanceQuery(url);

    // Summary buckets use the exact same where-clause as the transaction
    // list (date range + customer filter), each intersected with a single
    // type — so the summary always reflects the filtered subset currently
    // being listed below, not the fixed unfiltered all-time card total.
    const [
      paymentSum,
      electricitySum,
      adjustmentSum,
      totalCount,
      transactions,
    ] = await Promise.all([
      prisma.costPayment.aggregate({
        where: { AND: [where, { type: "PAYMENT" }] },
        _sum: { amount: true },
      }),
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

    const sumPayment = Number((paymentSum._sum.amount || 0).toFixed(2));
    const sumElectricityCharges = Number(
      (electricitySum._sum.amount || 0).toFixed(2),
    );
    const sumAdjustment = Number((adjustmentSum._sum.amount || 0).toFixed(2));
    const displayTotal = Number(
      (sumPayment + sumElectricityCharges + sumAdjustment).toFixed(2),
    );

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          sumPayment,
          sumElectricityCharges,
          sumAdjustment,
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
    console.error("[Admin Customer Balance] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch customer balance detail" },
      { status: 500 },
    );
  }
}
