import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { Prisma } from "@prisma/client";

/**
 * Drill-down for the adminpanel "Monthly Revenue (30 days)" card.
 * The summary block always reflects the exact same aggregate as the card
 * itself: type in [ELECTRICITY_CHARGES, ADJUSTMENT], createdAt within the
 * last 30 days, summed then sign-flipped for display. Filters (date range,
 * customer, type) and sorting only affect the itemized `transactions` list
 * below it — they never change the summary numbers, so the headline total
 * always matches the card regardless of how the list is filtered/sorted.
 */

const SORT_FIELDS = new Set([
  "createdAt",
  "type",
  "amount",
  "narration",
  "customer",
  "invoiceNumber",
]);

function buildOrderBy(
  sortBy: string,
  sortOrder: "asc" | "desc",
): Prisma.CostPaymentOrderByWithRelationInput {
  switch (sortBy) {
    case "type":
      return { type: sortOrder };
    case "amount":
      return { amount: sortOrder };
    case "narration":
      return { narration: sortOrder };
    case "customer":
      return { user: { name: sortOrder } };
    case "invoiceNumber":
      return { invoice: { invoiceNumber: sortOrder } };
    case "createdAt":
    default:
      return { createdAt: sortOrder };
  }
}

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
    const sortByParam = url.searchParams.get("sortBy") || "createdAt";
    const sortOrderParam = url.searchParams.get("sortOrder");
    const sortOrder: "asc" | "desc" = sortOrderParam === "asc" ? "asc" : "desc";
    const sortBy = SORT_FIELDS.has(sortByParam) ? sortByParam : "createdAt";
    const typeParam = url.searchParams.get("type");
    const customerParam = url.searchParams.get("customer")?.trim();
    const startDateParam = url.searchParams.get("startDate");
    const endDateParam = url.searchParams.get("endDate");

    if (page < 0 || pageSize < 1 || pageSize > 9999) {
      return NextResponse.json(
        { error: "Invalid pagination parameters" },
        { status: 400 },
      );
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Date filter narrows within the mandatory 30-day window — it can never
    // widen it, so the itemized list can never drift outside the period the
    // summary/card actually cover.
    let effectiveStart = thirtyDaysAgo;
    if (startDateParam) {
      const parsed = new Date(startDateParam);
      if (
        !isNaN(parsed.getTime()) &&
        parsed.getTime() > thirtyDaysAgo.getTime()
      ) {
        effectiveStart = parsed;
      }
    }

    let effectiveEnd = now;
    if (endDateParam) {
      const parsed = new Date(endDateParam);
      if (!isNaN(parsed.getTime())) {
        parsed.setHours(23, 59, 59, 999);
        if (parsed.getTime() < now.getTime()) {
          effectiveEnd = parsed;
        }
      }
    }

    const baseTypeFilter: Prisma.CostPaymentWhereInput["type"] =
      typeParam === "ELECTRICITY_CHARGES" || typeParam === "ADJUSTMENT"
        ? typeParam
        : { in: ["ELECTRICITY_CHARGES", "ADJUSTMENT"] };

    const where: Prisma.CostPaymentWhereInput = {
      type: baseTypeFilter,
      createdAt: { gte: effectiveStart, lte: effectiveEnd },
      ...(customerParam
        ? {
            user: {
              OR: [
                { name: { contains: customerParam, mode: "insensitive" } },
                { email: { contains: customerParam, mode: "insensitive" } },
              ],
            },
          }
        : {}),
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
          periodStart: thirtyDaysAgo.toISOString(),
          periodEnd: now.toISOString(),
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
