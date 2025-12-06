/**
 * Miners Dynamic API Routes
 *
 * Handles PUT and DELETE operations for individual miners.
 * Only admins can perform these operations.
 *
 * Endpoints:
 * - PUT /api/machine/[id] - Update a miner
 * - DELETE /api/machine/[id] - Delete a miner
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
 * Response type for API endpoints
 */
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

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
 * PUT /api/machine/[id]
 *
 * Update an existing miner
 *
 * Request Body:
 * {
 *   name?: string
 *   hardwareId?: string
 *   userId?: string
 *   spaceId?: string
 *   status?: string (ACTIVE or INACTIVE)
 * }
 *
 * Response: Updated miner object
 *
 * Status Codes:
 * - 200: Success
 * - 400: Bad request
 * - 401: Unauthorized
 * - 403: Forbidden (not admin)
 * - 404: Miner, user, space, or hardware not found
 * - 500: Server error
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await context.params;
    console.log(`[Miners API] PUT: Starting for miner id ${id}`);

    // Verify admin authorization
    try {
      await verifyAdminAuth(request);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      console.error(`[Miners API] PUT: ${errorMsg}`);

      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        {
          status: errorMsg.includes("Forbidden") ? 403 : 401,
        },
      );
    }

    // Check if miner exists
    const existingMiner = await prisma.miner.findUnique({
      where: { id },
    });

    if (!existingMiner) {
      console.error(`[Miners API] PUT: Miner not found - ${id}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Miner not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { name, hardwareId, userId, spaceId, status } = body;

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

    if (hardwareId !== undefined) {
      if (typeof hardwareId !== "string") {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "hardwareId must be a string" },
          { status: 400 },
        );
      }

      // Verify hardware exists
      const hardwareExists = await prisma.hardware.findUnique({
        where: { id: hardwareId },
        select: { id: true },
      });

      if (!hardwareExists) {
        console.error(`[Miners API] PUT: Hardware not found - ${hardwareId}`);
        return NextResponse.json<ApiResponse>(
          { success: false, error: "Hardware not found" },
          { status: 404 },
        );
      }

      updateData.hardwareId = hardwareId;
    }

    if (userId !== undefined) {
      if (typeof userId !== "string") {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "userId must be a string" },
          { status: 400 },
        );
      }

      // Verify user exists
      const userExists = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!userExists) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "User not found" },
          { status: 404 },
        );
      }

      updateData.userId = userId;
    }

    if (spaceId !== undefined) {
      if (typeof spaceId !== "string") {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "spaceId must be a string" },
          { status: 400 },
        );
      }

      // Verify space exists
      const spaceExists = await prisma.space.findUnique({
        where: { id: spaceId },
        select: { id: true },
      });

      if (!spaceExists) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "Space not found" },
          { status: 404 },
        );
      }

      updateData.spaceId = spaceId;
    }

    if (status !== undefined) {
      if (!["ACTIVE", "INACTIVE"].includes(status)) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "status must be ACTIVE or INACTIVE" },
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

    // Update miner
    const updatedMiner = await prisma.miner.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        space: {
          select: {
            id: true,
            name: true,
            location: true,
          },
        },
        hardware: {
          select: {
            id: true,
            model: true,
            powerUsage: true,
            hashRate: true,
          },
        },
      },
    });

    console.log(`[Miners API] PUT: Successfully updated miner ${id}`);

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: updatedMiner,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Miners API] PUT: Error - ${errorMsg}`);

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
 * DELETE /api/machine/[id]
 *
 * Delete a miner
 *
 * Response: Success message
 *
 * Status Codes:
 * - 200: Success
 * - 401: Unauthorized
 * - 403: Forbidden (not admin)
 * - 404: Miner not found
 * - 500: Server error
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await context.params;
    console.log(`[Miners API] DELETE: Starting for miner id ${id}`);

    // Verify admin authorization
    try {
      await verifyAdminAuth(request);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      console.error(`[Miners API] DELETE: ${errorMsg}`);

      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        {
          status: errorMsg.includes("Forbidden") ? 403 : 401,
        },
      );
    }

    // Check if miner exists
    const existingMiner = await prisma.miner.findUnique({
      where: { id },
    });

    if (!existingMiner) {
      console.error(`[Miners API] DELETE: Miner not found - ${id}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Miner not found" },
        { status: 404 },
      );
    }

    // Delete miner
    await prisma.miner.delete({
      where: { id },
    });

    console.log(`[Miners API] DELETE: Successfully deleted miner ${id}`);

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: { id, message: "Miner deleted successfully" },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Miners API] DELETE: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 },
    );
  }
}
