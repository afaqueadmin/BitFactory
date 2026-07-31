/**
 * POST /api/franchise/miners/bulk-edit
 *
 * Franchisee-facing bulk edit. Independent of admin's bulk-edit route.
 * Every targeted miner must belong to a customer of the calling franchisee
 * — verified as a set-membership check before any update is applied.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { verifyJwtToken } from "@/lib/jwt";
import { franchiseeMinerFilter } from "@/lib/franchiseeScope";

interface BulkEditRequest {
  minerIds: string[];
  updates: {
    spaceId?: string;
    rate_per_kwh?: number | string;
    status?: "AUTO" | "DEPLOYMENT_IN_PROGRESS" | "UNDER_MAINTENANCE";
    poolId?: string | null;
  };
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse<ApiResponse>> {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    if (decoded.role !== "FRANCHISEE") {
      return NextResponse.json(
        { success: false, error: "Franchisee access required" },
        { status: 403 },
      );
    }

    const body: BulkEditRequest = await req.json();
    const { minerIds, updates } = body;

    if (!Array.isArray(minerIds) || minerIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "minerIds must be a non-empty array" },
        { status: 400 },
      );
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "updates object must contain at least one field",
        },
        { status: 400 },
      );
    }

    if (updates.rate_per_kwh !== undefined) {
      const rate = Number(updates.rate_per_kwh);
      if (isNaN(rate) || rate <= 0) {
        return NextResponse.json(
          { success: false, error: "rate_per_kwh must be a positive number" },
          { status: 400 },
        );
      }
    }

    if (updates.status !== undefined) {
      if (
        !["AUTO", "DEPLOYMENT_IN_PROGRESS", "UNDER_MAINTENANCE"].includes(
          updates.status,
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "status must be AUTO, DEPLOYMENT_IN_PROGRESS, or UNDER_MAINTENANCE",
          },
          { status: 400 },
        );
      }
    }

    if (updates.poolId !== undefined && updates.poolId !== null) {
      if (typeof updates.poolId !== "string") {
        return NextResponse.json(
          { success: false, error: "poolId must be a string or null" },
          { status: 400 },
        );
      }
      const pool = await prisma.pool.findUnique({
        where: { id: updates.poolId },
      });
      if (!pool) {
        return NextResponse.json(
          { success: false, error: "Pool not found" },
          { status: 404 },
        );
      }
    }

    // Every targeted miner MUST belong to this franchisee's own customers.
    const ownedMiners = await prisma.miner.findMany({
      where: {
        id: { in: minerIds },
        ...franchiseeMinerFilter({ id: decoded.userId, role: decoded.role }),
      },
      select: { id: true, spaceId: true },
    });

    if (ownedMiners.length !== minerIds.length) {
      return NextResponse.json(
        { success: false, error: "One or more miners not found" },
        { status: 404 },
      );
    }

    if (updates.spaceId) {
      const space = await prisma.space.findUnique({
        where: { id: updates.spaceId },
      });
      if (!space) {
        return NextResponse.json(
          { success: false, error: "Space not found" },
          { status: 404 },
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (updates.spaceId !== undefined) updateData.spaceId = updates.spaceId;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.poolId !== undefined) updateData.poolId = updates.poolId;

    await prisma.miner.updateMany({
      where: { id: { in: minerIds } },
      data: updateData,
    });

    if (updates.rate_per_kwh !== undefined) {
      const rateDecimal = new Decimal(Number(updates.rate_per_kwh).toFixed(6));
      for (const minerId of minerIds) {
        const latestRate = await prisma.minerRateHistory.findFirst({
          where: { minerId },
          orderBy: { createdAt: "desc" },
          select: { rate_per_kwh: true },
        });
        if (!latestRate || !latestRate.rate_per_kwh.equals(rateDecimal)) {
          await prisma.minerRateHistory.create({
            data: { minerId, rate_per_kwh: rateDecimal },
          });
        }
      }
    }

    const updatedMiners = await prisma.miner.findMany({
      where: { id: { in: minerIds } },
      include: {
        hardware: { select: { model: true } },
        space: { select: { name: true } },
        rateHistory: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { rate_per_kwh: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: {
        updatedCount: updatedMiners.length,
        miners: updatedMiners.map((miner) => ({
          id: miner.id,
          name: miner.name,
          hardwareName: miner.hardware.model,
          spaceName: miner.space.name,
          status: miner.status,
          rate_per_kwh: miner.rateHistory[0]?.rate_per_kwh
            ? Number(miner.rateHistory[0].rate_per_kwh)
            : null,
          createdAt: miner.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("[Franchise Miners API] bulk-edit error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
