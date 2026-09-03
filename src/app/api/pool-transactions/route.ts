/**
 * Pool Transactions API Routes
 *
 * Read-only API for PoolTransaction - the raw ledger of pool-side
 * transactions (payouts, fees, revenue accrual). Admin/Super Admin only.
 * List is paginated and filterable (poolSubaccountId, category,
 * transactionType, date range) since this table holds thousands of rows.
 * Rows are populated by the pool sync cron; no write endpoints are exposed
 * here.
 *
 * Endpoints:
 * - GET /api/pool-transactions?page=&pageSize=&poolSubaccountId=&category=&transactionType=&startDate=&endDate=
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  pagination?: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  error?: string;
}

async function verifyAdminAuth(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) throw new Error("Unauthorized: No token provided");

  const decoded = await verifyJwtToken(token);
  if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
    throw new Error("Forbidden: Admin access required");
  }
  return { userId: decoded.userId, role: decoded.role };
}

const transactionSelect = {
  id: true,
  poolId: true,
  poolSubaccountId: true,
  externalTransactionId: true,
  transactionType: true,
  category: true,
  amount: true,
  usdEquivalent: true,
  addressName: true,
  status: true,
  occurredAt: true,
  createdAt: true,
  poolSubaccount: {
    select: {
      id: true,
      subaccountName: true,
      pool: { select: { id: true, name: true } },
    },
  },
} as const;

export async function GET(request: NextRequest) {
  try {
    await verifyAdminAuth(request);

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(
      1,
      parseInt(searchParams.get("page") || "1", 10) || 1,
    );
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10) || 50),
    );
    const poolSubaccountId = searchParams.get("poolSubaccountId") || undefined;
    const category = searchParams.get("category") || undefined;
    const transactionType = searchParams.get("transactionType") || undefined;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Prisma.PoolTransactionWhereInput = {};
    if (poolSubaccountId) where.poolSubaccountId = poolSubaccountId;
    if (category) where.category = category;
    if (transactionType) where.transactionType = transactionType;
    if (startDate || endDate) {
      where.occurredAt = {};
      if (startDate)
        where.occurredAt.gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) where.occurredAt.lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    const [rows, totalCount] = await Promise.all([
      prisma.poolTransaction.findMany({
        where,
        select: transactionSelect,
        orderBy: { occurredAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.poolTransaction.count({ where }),
    ]);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: rows,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize) || 1,
      },
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Internal server error";
    const status = msg.includes("Forbidden")
      ? 403
      : msg.includes("Unauthorized")
        ? 401
        : 500;
    return NextResponse.json<ApiResponse>(
      { success: false, error: msg },
      { status },
    );
  }
}
