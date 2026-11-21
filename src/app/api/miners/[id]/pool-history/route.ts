/**
 * Miner Pool History API Route
 *
 * Returns the ordered history of which pool a miner has been assigned to,
 * with computed from/to periods. Admin/Super Admin only.
 *
 * Endpoints:
 * - GET /api/miners/[id]/pool-history - Get pool assignment history for a miner
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
export const preferredRegion = "iad1";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;

    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "miners.view");
    if (denied) return denied;

    const miner = await prisma.miner.findUnique({
      where: { id },
      select: { id: true, poolId: true },
    });

    if (!miner) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Miner not found" },
        { status: 404 },
      );
    }

    const history = await prisma.minerPoolHistory.findMany({
      where: { minerId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        poolId: true,
        createdAt: true,
        pool: { select: { name: true } },
        createdBy: { select: { name: true, email: true } },
      },
    });

    // Compute from/to periods: each entry runs until the next entry starts,
    // or until now if it's the most recent AND the miner is still on that pool.
    const periods = history.map((entry, index) => {
      const next = history[index + 1];
      const isLatest = index === history.length - 1;
      return {
        id: entry.id,
        poolId: entry.poolId,
        poolName: entry.pool.name,
        from: entry.createdAt,
        to: next
          ? next.createdAt
          : isLatest && miner.poolId === entry.poolId
            ? null
            : entry.createdAt,
        isCurrent: isLatest && miner.poolId === entry.poolId,
        createdBy: entry.createdBy?.name || entry.createdBy?.email || null,
      };
    });

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: { minerId: id, currentPoolId: miner.poolId, periods },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Miner Pool History API] GET: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}
