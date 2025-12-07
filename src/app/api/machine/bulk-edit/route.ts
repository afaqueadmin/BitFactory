import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { verifyJwtToken } from "@/lib/jwt";

interface BulkEditRequest {
  minerIds: string[];
  updates: {
    spaceId?: string;
    rate_per_kwh?: number | string;
    status?: "ACTIVE" | "INACTIVE";
  };
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

    const body: BulkEditRequest = await req.json();
    const { minerIds, updates } = body;

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

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "updates object must contain at least one field",
        },
        { status: 400 },
      );
    }

    // Validate rate if provided
    if (updates.rate_per_kwh !== undefined) {
      const rate = Number(updates.rate_per_kwh);
      if (isNaN(rate) || rate <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: "rate_per_kwh must be a positive number",
          },
          { status: 400 },
        );
      }
    }

    // Validate status if provided
    if (updates.status !== undefined) {
      if (!["ACTIVE", "INACTIVE"].includes(updates.status)) {
        return NextResponse.json(
          {
            success: false,
            error: "status must be ACTIVE or INACTIVE",
          },
          { status: 400 },
        );
      }
    }

    // Verify all miners exist
    const existingMiners = await prisma.miner.findMany({
      where: {
        id: { in: minerIds },
      },
      select: { id: true, spaceId: true },
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

    // Verify space exists if provided
    if (updates.spaceId) {
      const space = await prisma.space.findUnique({
        where: { id: updates.spaceId },
      });

      if (!space) {
        return NextResponse.json(
          {
            success: false,
            error: "Space not found",
          },
          { status: 404 },
        );
      }
    }

    // Process bulk update in transaction
    const result = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};

      // Add fields to update
      if (updates.spaceId !== undefined) {
        updateData.spaceId = updates.spaceId;
      }
      if (updates.status !== undefined) {
        updateData.status = updates.status;
      }

      // Update all miners
      await tx.miner.updateMany({
        where: { id: { in: minerIds } },
        data: updateData,
      });

      // Handle rate history updates
      if (updates.rate_per_kwh !== undefined) {
        const rateDecimal = new Decimal(
          Number(updates.rate_per_kwh).toFixed(6),
        );

        for (const minerId of minerIds) {
          // Get latest rate for this miner
          const latestRate = await tx.minerRateHistory.findFirst({
            where: { minerId },
            orderBy: { createdAt: "desc" },
            select: { rate_per_kwh: true },
          });

          // Only create new history entry if rate differs
          if (!latestRate || !latestRate.rate_per_kwh.equals(rateDecimal)) {
            await tx.minerRateHistory.create({
              data: {
                minerId,
                rate_per_kwh: rateDecimal,
              },
            });
          }
        }
      }

      // Fetch updated miners
      const updatedMiners = await tx.miner.findMany({
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

      // Transform for response
      const transformedMiners = updatedMiners.map((miner) => ({
        id: miner.id,
        name: miner.name,
        hardwareName: miner.hardware.model,
        spaceName: miner.space.name,
        status: miner.status,
        rate_per_kwh: miner.rateHistory[0]?.rate_per_kwh
          ? Number(miner.rateHistory[0].rate_per_kwh)
          : null,
        createdAt: miner.createdAt,
      }));

      return {
        updatedCount: updatedMiners.length,
        miners: transformedMiners,
      };
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Bulk edit error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
