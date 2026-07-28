import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { Prisma } from "@prisma/client";

/**
 * List of all ADJUSTMENT-type CostPayment transactions, across all
 * customers, for the Credit Adjustments admin page. Paginated, sortable,
 * and filterable by customer + date range.
 */

const SORT_FIELDS = new Set(["createdAt", "amount", "narration", "customer"]);

function buildOrderBy(
  sortBy: string,
  sortOrder: "asc" | "desc",
): Prisma.CostPaymentOrderByWithRelationInput {
  switch (sortBy) {
    case "amount":
      return { amount: sortOrder };
    case "narration":
      return { narration: sortOrder };
    case "customer":
      return { user: { name: sortOrder } };
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
      console.error("[Admin Adjustments] Token verification failed:", error);
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

    const sortByParam = url.searchParams.get("sortBy") || "createdAt";
    const sortOrderParam = url.searchParams.get("sortOrder");
    const sortOrder: "asc" | "desc" = sortOrderParam === "asc" ? "asc" : "desc";
    const sortBy = SORT_FIELDS.has(sortByParam) ? sortByParam : "createdAt";

    const customerIdParam = url.searchParams.get("customerId")?.trim();
    const startDateParam = url.searchParams.get("startDate");
    const endDateParam = url.searchParams.get("endDate");

    let startDate: Date | null = null;
    if (startDateParam) {
      const parsed = new Date(startDateParam);
      if (!isNaN(parsed.getTime())) {
        startDate = parsed;
      }
    }

    let endDate: Date | null = null;
    if (endDateParam) {
      const parsed = new Date(endDateParam);
      if (!isNaN(parsed.getTime())) {
        parsed.setHours(23, 59, 59, 999);
        endDate = parsed;
      }
    }

    const where: Prisma.CostPaymentWhereInput = {
      type: "ADJUSTMENT",
      user: { isDeleted: false },
      ...(customerIdParam ? { userId: customerIdParam } : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    const [totalCount, sumResult, transactions] = await Promise.all([
      prisma.costPayment.count({ where }),
      prisma.costPayment.aggregate({ where, _sum: { amount: true } }),
      prisma.costPayment.findMany({
        where,
        orderBy: buildOrderBy(sortBy, sortOrder),
        skip: page * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalAmount: Number((sumResult._sum.amount || 0).toFixed(2)),
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
          invoiceNumber: null,
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
    console.error("[Admin Adjustments] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch adjustments" },
      { status: 500 },
    );
  }
}
