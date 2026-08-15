/**
 * Pool Subaccount Daily Snapshots API Routes
 *
 * CRUD for PoolSubaccountDailySnapshot. Admin/Super Admin only.
 * List is paginated and filterable (poolSubaccountId, date range) since this
 * table holds thousands of rows.
 *
 * Endpoints:
 * - GET /api/pool-daily-snapshots?page=&pageSize=&poolSubaccountId=&startDate=&endDate=
 * - POST /api/pool-daily-snapshots - create a snapshot row
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

const snapshotSelect = {
  id: true,
  poolSubaccountId: true,
  date: true,
  hashrate: true,
  efficiency: true,
  uptime: true,
  activeWorkers: true,
  hashprice: true,
  balance: true,
  miningRevenue: true,
  referralRevenue: true,
  otherRevenue: true,
  totalRevenue: true,
  createdAt: true,
  updatedAt: true,
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
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Prisma.PoolSubaccountDailySnapshotWhereInput = {};
    if (poolSubaccountId) where.poolSubaccountId = poolSubaccountId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) where.date.lte = new Date(`${endDate}T00:00:00.000Z`);
    }

    const [rows, totalCount] = await Promise.all([
      prisma.poolSubaccountDailySnapshot.findMany({
        where,
        select: snapshotSelect,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.poolSubaccountDailySnapshot.count({ where }),
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
      date,
      hashrate,
      efficiency,
      uptime,
      activeWorkers,
      hashprice,
      balance,
      miningRevenue,
      referralRevenue,
      otherRevenue,
    } = body;

    if (!poolSubaccountId || typeof poolSubaccountId !== "string") {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "poolSubaccountId is required" },
        { status: 400 },
      );
    }
    if (!date) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "date is required" },
        { status: 400 },
      );
    }

    const mining = miningRevenue ? Number(miningRevenue) : 0;
    const referral = referralRevenue ? Number(referralRevenue) : 0;
    const other = otherRevenue ? Number(otherRevenue) : 0;

    const snapshot = await prisma.poolSubaccountDailySnapshot.create({
      data: {
        poolSubaccountId,
        date: new Date(`${date}T00:00:00.000Z`),
        hashrate:
          hashrate === "" || hashrate === undefined ? null : Number(hashrate),
        efficiency:
          efficiency === "" || efficiency === undefined
            ? null
            : Number(efficiency),
        uptime: uptime === "" || uptime === undefined ? null : Number(uptime),
        activeWorkers:
          activeWorkers === "" || activeWorkers === undefined
            ? null
            : Number(activeWorkers),
        hashprice:
          hashprice === "" || hashprice === undefined
            ? null
            : Number(hashprice),
        balance:
          balance === "" || balance === undefined ? null : Number(balance),
        miningRevenue: mining,
        referralRevenue: referral,
        otherRevenue: other,
        totalRevenue: mining + referral + other,
      },
      select: snapshotSelect,
    });

    return NextResponse.json<ApiResponse>(
      { success: true, data: snapshot },
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
            ? "A snapshot already exists for this subaccount and date"
            : msg,
      },
      { status },
    );
  }
}
