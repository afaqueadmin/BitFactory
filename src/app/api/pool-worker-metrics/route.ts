/**
 * Pool Worker Daily Metrics API Routes
 *
 * CRUD for PoolWorkerDailyMetric. Admin/Super Admin only.
 * List is paginated and filterable (poolSubaccountId, workerName, date range)
 * since this table holds tens of thousands of rows.
 *
 * Endpoints:
 * - GET /api/pool-worker-metrics?page=&pageSize=&poolSubaccountId=&workerName=&startDate=&endDate=
 * - POST /api/pool-worker-metrics - create a worker-day metric row
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

const workerMetricSelect = {
  id: true,
  poolSubaccountId: true,
  workerName: true,
  externalWorkerId: true,
  date: true,
  hashrate: true,
  efficiency: true,
  staleShares: true,
  rejectedShares: true,
  estRevenue: true,
  firmware: true,
  status: true,
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
    const workerName = searchParams.get("workerName") || undefined;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Prisma.PoolWorkerDailyMetricWhereInput = {};
    if (poolSubaccountId) where.poolSubaccountId = poolSubaccountId;
    if (workerName)
      where.workerName = { contains: workerName, mode: "insensitive" };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) where.date.lte = new Date(`${endDate}T00:00:00.000Z`);
    }

    const [rows, totalCount] = await Promise.all([
      prisma.poolWorkerDailyMetric.findMany({
        where,
        select: workerMetricSelect,
        orderBy: [{ date: "desc" }, { workerName: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.poolWorkerDailyMetric.count({ where }),
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

export async function POST(request: NextRequest) {
  try {
    await verifyAdminAuth(request);

    const body = await request.json();
    const {
      poolSubaccountId,
      workerName,
      externalWorkerId,
      date,
      hashrate,
      efficiency,
      staleShares,
      rejectedShares,
      estRevenue,
      firmware,
      status,
    } = body;

    if (!poolSubaccountId || typeof poolSubaccountId !== "string") {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "poolSubaccountId is required" },
        { status: 400 },
      );
    }
    if (!workerName || typeof workerName !== "string" || !workerName.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "workerName is required" },
        { status: 400 },
      );
    }
    if (!date) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "date is required" },
        { status: 400 },
      );
    }

    const metric = await prisma.poolWorkerDailyMetric.create({
      data: {
        poolSubaccountId,
        workerName: workerName.trim(),
        externalWorkerId: externalWorkerId?.trim() || null,
        date: new Date(`${date}T00:00:00.000Z`),
        hashrate:
          hashrate === "" || hashrate === undefined ? null : Number(hashrate),
        efficiency:
          efficiency === "" || efficiency === undefined
            ? null
            : Number(efficiency),
        staleShares:
          staleShares === "" || staleShares === undefined
            ? null
            : Number(staleShares),
        rejectedShares:
          rejectedShares === "" || rejectedShares === undefined
            ? null
            : Number(rejectedShares),
        estRevenue:
          estRevenue === "" || estRevenue === undefined
            ? null
            : Number(estRevenue),
        firmware: firmware?.trim() || null,
        status: status?.trim() || null,
      },
      select: workerMetricSelect,
    });

    return NextResponse.json<ApiResponse>(
      { success: true, data: metric },
      { status: 201 },
    );
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Internal server error";
    const status = msg.includes("Forbidden")
      ? 403
      : msg.includes("Unauthorized")
        ? 401
        : msg.includes("Unique constraint")
          ? 409
          : 500;
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error:
          status === 409
            ? "A metric row already exists for this worker and date"
            : msg,
      },
      { status },
    );
  }
}
