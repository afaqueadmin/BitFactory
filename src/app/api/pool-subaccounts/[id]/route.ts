/**
 * Pool Subaccount [id] API Routes
 *
 * Read-only GET for a single PoolSubaccount. Admin/Super Admin only.
 * No write endpoints are exposed here - rows are populated by the pool sync
 * cron.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationContext,
  requirePermission,
} from "@/lib/auth/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
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
    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "db_data.view");
    if (denied) return denied;
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
