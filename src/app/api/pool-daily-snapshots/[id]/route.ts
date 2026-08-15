/**
 * Pool Subaccount Daily Snapshot [id] API Routes
 * GET/PUT/DELETE for a single PoolSubaccountDailySnapshot. Admin/Super Admin only.
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await verifyAdminAuth(request);
    const { id } = await params;
    const body = await request.json();
    const {
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

    const mining =
      miningRevenue === "" || miningRevenue === undefined
        ? 0
        : Number(miningRevenue);
    const referral =
      referralRevenue === "" || referralRevenue === undefined
        ? 0
        : Number(referralRevenue);
    const other =
      otherRevenue === "" || otherRevenue === undefined
        ? 0
        : Number(otherRevenue);

    const snapshot = await prisma.poolSubaccountDailySnapshot.update({
      where: { id },
      data: {
        ...(date ? { date: new Date(`${date}T00:00:00.000Z`) } : {}),
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

    return NextResponse.json<ApiResponse>({ success: true, data: snapshot });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Internal server error";
    const status = msg.includes("Forbidden")
      ? 403
      : msg.includes("Unauthorized")
        ? 401
        : msg.includes("Record to update not found")
          ? 404
          : 500;
    return NextResponse.json<ApiResponse>(
      { success: false, error: status === 404 ? "Snapshot not found" : msg },
      { status },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await verifyAdminAuth(request);
    const { id } = await params;

    await prisma.poolSubaccountDailySnapshot.delete({ where: { id } });

    return NextResponse.json<ApiResponse>({ success: true });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Internal server error";
    const status = msg.includes("Forbidden")
      ? 403
      : msg.includes("Unauthorized")
        ? 401
        : msg.includes("Record to delete does not exist")
          ? 404
          : 500;
    return NextResponse.json<ApiResponse>(
      { success: false, error: status === 404 ? "Snapshot not found" : msg },
      { status },
    );
  }
}
