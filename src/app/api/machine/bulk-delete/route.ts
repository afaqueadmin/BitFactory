import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@prisma/client";

interface BulkDeleteRequest {
  minerIds: string[];
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Thrown inside the delete transaction to roll it back. */
class ConcurrentDeleteError extends Error {}

async function verifyAdminAuth(request: NextRequest) {
  const token = request.cookies.get("token")?.value;

  if (!token) {
    throw new Error("Unauthorized: No token provided");
  }

  try {
    const decoded = await verifyJwtToken(token);

    if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
      throw new Error("Forbidden: Admin access required");
    }

    return {
      userId: decoded.userId,
      role: decoded.role,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Invalid token");
  }
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse<ApiResponse>> {
  try {
    // Verify admin authorization
    let actorUserId: string;
    try {
      ({ userId: actorUserId } = await verifyAdminAuth(req));
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      if (errorMsg.includes("Unauthorized")) {
        return NextResponse.json(
          { success: false, error: errorMsg },
          { status: 401 },
        );
      }
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 403 },
      );
    }

    const body: BulkDeleteRequest = await req.json();
    const { minerIds } = body;

    // Validate input
    if (!Array.isArray(minerIds) || minerIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "minerIds must be a non-empty array",
        },
        { status: 400 },
      );
    }

    // Verify all miners exist
    const existingMiners = await prisma.miner.findMany({
      where: {
        id: { in: minerIds },
      },
      include: {
        hardware: { select: { id: true } },
        user: { select: { id: true, name: true, franchiseeId: true } },
      },
    });

    if (existingMiners.length !== minerIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: "One or more miners not found",
        },
        { status: 404 },
      );
    }

    // Already-deleted miners (e.g. selected with "Show Deleted" on) are
    // skipped - they've already returned their hardware unit to stock.
    const liveMiners = existingMiners.filter((m) => !m.isDeleted);
    const skippedMinerIds = existingMiners
      .filter((m) => m.isDeleted)
      .map((m) => m.id);

    if (liveMiners.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "All selected miners are already deleted",
        },
        { status: 400 },
      );
    }

    // Miners owned by a customer assigned to a franchisee cannot be deleted
    // until that customer is unassigned first.
    const franchiseLinkedMiners = liveMiners.filter((m) => m.user.franchiseeId);
    if (franchiseLinkedMiners.length > 0) {
      const customerNames = [
        ...new Set(franchiseLinkedMiners.map((m) => m.user.name || m.user.id)),
      ];
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete miner(s) owned by customer(s) assigned to a franchisee (${customerNames.join(", ")}). Unassign the customer(s) first.`,
        },
        { status: 400 },
      );
    }

    const liveMinerIds = liveMiners.map((m) => m.id);

    // Process bulk delete in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get miners with details for response
      const deletedMiners = await tx.miner.findMany({
        where: { id: { in: liveMinerIds }, isDeleted: false },
        include: {
          hardware: { select: { id: true, model: true } },
          space: { select: { name: true } },
        },
      });

      // Calculate hardware quantities to restore
      const hardwareQuantities: { [key: string]: number } = {};
      for (const miner of deletedMiners) {
        const hwId = miner.hardware.id;
        hardwareQuantities[hwId] = (hardwareQuantities[hwId] || 0) + 1;
      }

      // Delete all miners (CASCADE deletes rate history)
      // await tx.miner.deleteMany({
      //   where: { id: { in: minerIds } },
      // });

      // Soft-Delete all miners (Do not delete rate history). Guarded on
      // isDeleted: if a concurrent delete got to any of them first, roll back
      // rather than return their hardware units to stock a second time.
      const deletedMinerIds = deletedMiners.map((m) => m.id);
      const { count } = await tx.miner.updateMany({
        where: { id: { in: deletedMinerIds }, isDeleted: false },
        data: {
          isDeleted: true,
          deletedById: actorUserId,
          deletedAt: new Date(),
        },
      });
      if (count !== deletedMinerIds.length) {
        throw new ConcurrentDeleteError();
      }

      // Restore hardware quantities
      for (const [hwId, count] of Object.entries(hardwareQuantities)) {
        await tx.hardware.update({
          where: { id: hwId },
          data: { quantity: { increment: count } },
        });
      }

      await tx.auditLog.createMany({
        data: deletedMiners.map((miner) => ({
          action: AuditAction.MINER_DELETED,
          entityType: "Miner",
          entityId: miner.id,
          userId: actorUserId,
          description: `Miner ${miner.name} deleted (bulk delete)`,
        })),
      });

      return {
        deletedCount: deletedMiners.length,
        miners: deletedMiners.map((m) => ({
          id: m.id,
          name: m.name,
          hardwareName: m.hardware.model,
          spaceName: m.space.name,
        })),
        hardwareRestored: hardwareQuantities,
        skippedCount: skippedMinerIds.length,
        skippedMinerIds,
      };
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof ConcurrentDeleteError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Some of these miners were deleted by another request. Refresh and try again.",
        },
        { status: 409 },
      );
    }
    console.error("Bulk delete error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
