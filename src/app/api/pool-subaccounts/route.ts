/**
 * Pool Subaccounts API Routes
 *
 * CRUD for PoolSubaccount - the dimension row identifying a pool account
 * (Luxor subaccount / Braiins account), optionally linked to a User and a
 * PoolAuth credential. Admin/Super Admin only.
 *
 * Pool/User/PoolAuth are referenced read-only here (for display + dropdown
 * selection) - their own CRUD lives at /api/pools, /api/user, /api/pool-auth
 * respectively and is not duplicated here.
 *
 * Endpoints:
 * - GET /api/pool-subaccounts - list all pool subaccounts
 * - POST /api/pool-subaccounts - create a pool subaccount
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
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

const poolSubaccountSelect = {
  id: true,
  poolId: true,
  subaccountName: true,
  userId: true,
  poolAuthId: true,
  currency: true,
  walletAddress: true,
  paymentFrequency: true,
  dayOfWeek: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
  pool: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, email: true } },
  _count: {
    select: { dailySnapshots: true, workerMetrics: true, transactions: true },
  },
} as const;

export async function GET(request: NextRequest) {
  try {
    await verifyAdminAuth(request);

    const subaccounts = await prisma.poolSubaccount.findMany({
      select: poolSubaccountSelect,
      orderBy: [{ pool: { name: "asc" } }, { subaccountName: "asc" }],
    });

    return NextResponse.json<ApiResponse>({ success: true, data: subaccounts });
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
      poolId,
      subaccountName,
      userId,
      poolAuthId,
      currency,
      walletAddress,
      paymentFrequency,
      dayOfWeek,
    } = body;

    if (!poolId || typeof poolId !== "string") {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "poolId is required" },
        { status: 400 },
      );
    }
    if (
      !subaccountName ||
      typeof subaccountName !== "string" ||
      !subaccountName.trim()
    ) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "subaccountName is required" },
        { status: 400 },
      );
    }

    const existing = await prisma.poolSubaccount.findUnique({
      where: {
        poolId_subaccountName: {
          poolId,
          subaccountName: subaccountName.trim(),
        },
      },
    });
    if (existing) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "A subaccount with this name already exists for this pool",
        },
        { status: 409 },
      );
    }

    const subaccount = await prisma.poolSubaccount.create({
      data: {
        poolId,
        subaccountName: subaccountName.trim(),
        userId: userId || null,
        poolAuthId: poolAuthId || null,
        currency: currency?.trim() || "BTC",
        walletAddress: walletAddress?.trim() || null,
        paymentFrequency: paymentFrequency?.trim() || null,
        dayOfWeek: dayOfWeek?.trim() || null,
      },
      select: poolSubaccountSelect,
    });

    return NextResponse.json<ApiResponse>(
      { success: true, data: subaccount },
      { status: 201 },
    );
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
