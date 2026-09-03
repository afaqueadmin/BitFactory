/**
 * Pool Subaccount [id] API Routes
 *
 * Read-only GET for a single PoolSubaccount. Admin/Super Admin only.
 * No write endpoints are exposed here - rows are populated by the pool sync
 * cron.
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await verifyAdminAuth(request);
    const { id } = await params;

    const subaccount = await prisma.poolSubaccount.findUnique({
      where: { id },
      select: poolSubaccountSelect,
    });

    if (!subaccount) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Pool subaccount not found" },
        { status: 404 },
      );
    }

    return NextResponse.json<ApiResponse>({ success: true, data: subaccount });
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
