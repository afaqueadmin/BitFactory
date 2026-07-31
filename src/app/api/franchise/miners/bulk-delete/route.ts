/**
 * POST /api/franchise/miners/bulk-delete
 *
 * Franchisee-facing bulk delete. Independent of admin's bulk-delete route.
 * Every targeted miner must belong to a customer of the calling franchisee.
 * Unlike the admin route, this does NOT block deleting franchise-linked
 * customers' miners — every miner reachable here already belongs to the
 * caller's own franchise.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { franchiseeMinerFilter } from "@/lib/franchiseeScope";

interface BulkDeleteRequest {
  minerIds: string[];
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

    const body: BulkDeleteRequest = await req.json();
    const { minerIds } = body;

    if (!Array.isArray(minerIds) || minerIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "minerIds must be a non-empty array" },
        { status: 400 },
      );
    }

    const ownedMiners = await prisma.miner.findMany({
      where: {
        id: { in: minerIds },
        ...franchiseeMinerFilter({ id: decoded.userId, role: decoded.role }),
      },
      include: {
        hardware: { select: { id: true, model: true } },
        space: { select: { name: true } },
      },
    });

    if (ownedMiners.length !== minerIds.length) {
      return NextResponse.json(
        { success: false, error: "One or more miners not found" },
        { status: 404 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const hardwareQuantities: { [key: string]: number } = {};
      for (const miner of ownedMiners) {
        const hwId = miner.hardware.id;
        hardwareQuantities[hwId] = (hardwareQuantities[hwId] || 0) + 1;
      }

      await tx.miner.updateMany({
        where: { id: { in: minerIds } },
        data: { isDeleted: true },
      });

      for (const [hwId, count] of Object.entries(hardwareQuantities)) {
        await tx.hardware.update({
          where: { id: hwId },
          data: { quantity: { increment: count } },
        });
      }

      return {
        deletedCount: ownedMiners.length,
        miners: ownedMiners.map((m) => ({
          id: m.id,
          name: m.name,
          hardwareName: m.hardware.model,
          spaceName: m.space.name,
        })),
        hardwareRestored: hardwareQuantities,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Franchise Miners API] bulk-delete error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
