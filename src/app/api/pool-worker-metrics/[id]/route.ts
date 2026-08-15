/**
 * Pool Worker Daily Metric [id] API Routes
 * GET/PUT/DELETE for a single PoolWorkerDailyMetric. Admin/Super Admin only.
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await verifyAdminAuth(request);
    const { id } = await params;
    const body = await request.json();
    const {
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

    if (!workerName || typeof workerName !== "string" || !workerName.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "workerName is required" },
        { status: 400 },
      );
    }

    const metric = await prisma.poolWorkerDailyMetric.update({
      where: { id },
      data: {
        workerName: workerName.trim(),
        externalWorkerId: externalWorkerId?.trim() || null,
        ...(date ? { date: new Date(`${date}T00:00:00.000Z`) } : {}),
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

    return NextResponse.json<ApiResponse>({ success: true, data: metric });
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
      {
        success: false,
        error: status === 404 ? "Worker metric not found" : msg,
      },
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

    await prisma.poolWorkerDailyMetric.delete({ where: { id } });

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
      {
        success: false,
        error: status === 404 ? "Worker metric not found" : msg,
      },
      { status },
    );
  }
}
