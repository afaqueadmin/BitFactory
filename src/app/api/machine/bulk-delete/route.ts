import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

interface BulkDeleteRequest {
  minerIds: string[];
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

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
    try {
      await verifyAdminAuth(req);
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
      include: { hardware: { select: { id: true } } },
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

    // Process bulk delete in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get miners with details for response
      const deletedMiners = await tx.miner.findMany({
        where: { id: { in: minerIds } },
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
      await tx.miner.deleteMany({
        where: { id: { in: minerIds } },
      });

      // Restore hardware quantities
      for (const [hwId, count] of Object.entries(hardwareQuantities)) {
        await tx.hardware.update({
          where: { id: hwId },
          data: { quantity: { increment: count } },
        });
      }

      return {
        deletedCount: deletedMiners.length,
        miners: deletedMiners.map((m) => ({
          id: m.id,
          name: m.name,
          hardwareName: m.hardware.model,
          spaceName: m.space.name,
        })),
        hardwareRestored: hardwareQuantities,
      };
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
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
