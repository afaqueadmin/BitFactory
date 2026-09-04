/**
 * /api/franchise/miners
 *
 * Franchisee-facing miners list. Read-only - the franchise miners page is
 * view only, no create/edit/delete. Independent of the admin /api/machine
 * routes — no shared code, so admin behavior can't regress from
 * franchise-specific changes here.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { franchiseeMinerFilter } from "@/lib/franchiseeScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

async function requireFranchisee(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 as const };

  let decoded;
  try {
    decoded = await verifyJwtToken(token);
  } catch {
    return { error: "Invalid token", status: 401 as const };
  }

  if (decoded.role !== "FRANCHISEE") {
    return { error: "Franchisee access required", status: 403 as const };
  }

  return { decoded };
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse>> {
  try {
    const auth = await requireFranchisee(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const spaceId = searchParams.get("spaceId");
    const userId = searchParams.get("userId");
    const includeDeleted = searchParams.get("isDeleted") === "true";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = includeDeleted ? {} : { isDeleted: false };
    if (status) where.status = status;
    if (spaceId) where.spaceId = spaceId;
    if (userId) where.userId = userId;
    Object.assign(
      where,
      franchiseeMinerFilter({
        id: auth.decoded.userId,
        role: auth.decoded.role,
      }),
    );

    const miners = await prisma.miner.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            luxorSubaccountName: true,
            segment: true,
          },
        },
        space: { select: { id: true, name: true, location: true } },
        hardware: {
          select: { id: true, model: true, powerUsage: true, hashRate: true },
        },
        rateHistory: {
          select: { rate_per_kwh: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
        hashrateBenchmarks: {
          select: { benchmarkHashrate: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        pool: {
          select: { id: true, name: true, apiUrl: true, description: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const transformed = miners.map((miner) => ({
      ...miner,
      rate_per_kwh:
        miner.rateHistory && miner.rateHistory.length > 0
          ? miner.rateHistory[0].rate_per_kwh
          : undefined,
      benchmarkHashrate:
        miner.hashrateBenchmarks && miner.hashrateBenchmarks.length > 0
          ? miner.hashrateBenchmarks[0].benchmarkHashrate
          : undefined,
    }));

    return NextResponse.json({
      success: true,
      data: transformed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Franchise Miners API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch miners" },
      { status: 500 },
    );
  }
}
