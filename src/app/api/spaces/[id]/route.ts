/**
 * Spaces Dynamic API Routes
 *
 * Handles PUT and DELETE operations for individual mining spaces.
 * Only admins can perform these operations.
 *
 * Endpoints:
 * - PUT /api/spaces/[id] - Update a space
 * - DELETE /api/spaces/[id] - Delete a space
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const preferredRegion = "auto";

/**
 * Helper: Verify admin authorization
 *
 * Checks if the user making the request is an admin
 *
 * @param request - NextRequest object
 * @returns Object with userId and role if authorized
 * @throws Error if not authorized
 */
async function verifyAdminAuth(request: NextRequest) {
  const token = request.cookies.get("token")?.value;

  if (!token) {
    throw new Error("Unauthorized: No token provided");
  }

  try {
    const decoded = await verifyJwtToken(token);

    // Verify user is admin
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

/**
 * Response type for API endpoints
 */
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

/**
 * PUT /api/spaces/[id]
 *
 * Update an existing mining space
 *
 * Request Body:
 * {
 *   name?: string
 *   location?: string
 *   capacity?: number
 *   powerCapacity?: number
 *   status?: string
 * }
 *
 * Response: Updated space object
 *
 * Status Codes:
 * - 200: Success
 * - 400: Bad request
 * - 401: Unauthorized
 * - 403: Forbidden (not admin)
 * - 404: Space not found
 * - 500: Server error
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await context.params;
    console.log(`[Spaces API] PUT: Starting for space id ${id}`);

    // Verify admin authorization
    try {
      await verifyAdminAuth(request);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      console.error(`[Spaces API] PUT: ${errorMsg}`);

      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        {
          status: errorMsg.includes("Forbidden") ? 403 : 401,
        },
      );
    }

    // Check if space exists
    const existingSpace = await prisma.space.findUnique({
      where: { id },
    });

    if (!existingSpace) {
      console.error(`[Spaces API] PUT: Space not found - ${id}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Space not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { name, location, capacity, powerCapacity, status } = body;

    // Build update data with only provided fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (name !== undefined) {
      if (typeof name !== "string") {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "name must be a string" },
          { status: 400 },
        );
      }
      updateData.name = name.trim();
    }

    if (location !== undefined) {
      if (typeof location !== "string") {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "location must be a string" },
          { status: 400 },
        );
      }
      updateData.location = location.trim();
    }

    if (capacity !== undefined) {
      if (typeof capacity !== "number" || capacity <= 0) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "capacity must be a positive number" },
          { status: 400 },
        );
      }
      updateData.capacity = capacity;
    }

    if (powerCapacity !== undefined) {
      if (typeof powerCapacity !== "number" || powerCapacity <= 0) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "powerCapacity must be a positive number" },
          { status: 400 },
        );
      }
      updateData.powerCapacity = powerCapacity;
    }

    if (status !== undefined) {
      if (!["AVAILABLE", "OCCUPIED"].includes(status)) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "status must be AVAILABLE or OCCUPIED" },
          { status: 400 },
        );
      }
      updateData.status = status;
    }

    // If no fields to update, return error
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "No fields to update" },
        { status: 400 },
      );
    }

    // Update space
    const updatedSpace = await prisma.space.update({
      where: { id },
      data: updateData,
      include: {
        miners: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    console.log(`[Spaces API] PUT: Successfully updated space ${id}`);

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          ...updatedSpace,
          minerCount: updatedSpace.miners.length,
          activeMinerCount: updatedSpace.miners.filter(
            (m) => m.status === "ACTIVE",
          ).length,
          capacityUsed: updatedSpace.miners.length,
          capacityPercentage: (
            (updatedSpace.miners.length / updatedSpace.capacity) *
            100
          ).toFixed(2),
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Spaces API] PUT: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/spaces/[id]
 *
 * Delete a mining space
 *
 * Note: Cannot delete if space has associated miners
 *
 * Response: Success message
 *
 * Status Codes:
 * - 200: Success
 * - 400: Space has associated miners
 * - 401: Unauthorized
 * - 403: Forbidden (not admin)
 * - 404: Space not found
 * - 500: Server error
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await context.params;
    console.log(`[Spaces API] DELETE: Starting for space id ${id}`);

    // Verify admin authorization
    try {
      await verifyAdminAuth(request);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      console.error(`[Spaces API] DELETE: ${errorMsg}`);

      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        {
          status: errorMsg.includes("Forbidden") ? 403 : 401,
        },
      );
    }

    // Check if space exists
    const existingSpace = await prisma.space.findUnique({
      where: { id },
      include: {
        miners: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!existingSpace) {
      console.error(`[Spaces API] DELETE: Space not found - ${id}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Space not found" },
        { status: 404 },
      );
    }

    // Check if space has miners
    if (existingSpace.miners.length > 0) {
      console.error(
        `[Spaces API] DELETE: Cannot delete space with ${existingSpace.miners.length} miners`,
      );
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: `Cannot delete space with ${existingSpace.miners.length} associated miner(s). Please remove all miners first.`,
        },
        { status: 400 },
      );
    }

    // Delete space
    await prisma.space.delete({
      where: { id },
    });

    console.log(`[Spaces API] DELETE: Successfully deleted space ${id}`);

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: { id, message: "Space deleted successfully" },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Spaces API] DELETE: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 },
    );
  }
}
