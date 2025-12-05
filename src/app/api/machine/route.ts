/**
 * Miners API Routes
 *
 * Handles CRUD operations for mining machines (miners).
 * Only admins can perform these operations.
 *
 * Endpoints:
 * - GET /api/machine - Get all miners (admin only)
 * - POST /api/machine - Create a new miner (admin only)
 * - PUT /api/machine/[id] - Update a miner (admin only)
 * - DELETE /api/machine/[id] - Delete a miner (admin only)
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
 * GET /api/machine
 *
 * Retrieve all miners with their associated user and space details
 *
 * Query Parameters:
 * - status: Filter by status (ACTIVE, INACTIVE)
 * - spaceId: Filter by space ID
 * - userId: Filter by user ID
 * - sortBy: Sort field (name, model, status, hashRate, powerUsage, createdAt) - default: createdAt
 * - order: Sort order (asc, desc) - default: desc
 *
 * Response: Array of miners with associated user and space data
 *
 * Status Codes:
 * - 200: Success
 * - 401: Unauthorized
 * - 403: Forbidden (not admin)
 * - 500: Server error
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse>> {
  try {
    console.log("[Miners API] GET: Starting");

    // Verify admin authorization
    try {
      await verifyAdminAuth(request);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      console.error(`[Miners API] GET: ${errorMsg}`);

      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        {
          status: errorMsg.includes("Forbidden") ? 403 : 401,
        },
      );
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const spaceId = searchParams.get("spaceId");
    const userId = searchParams.get("userId");
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const order = searchParams.get("order") || "desc";

    // Build where clause for filtering
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (spaceId) {
      where.spaceId = spaceId;
    }
    if (userId) {
      where.userId = userId;
    }

    // Build order by clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderBy: any = {};
    const validSortFields = [
      "name",
      "model",
      "status",
      "hashRate",
      "powerUsage",
      "createdAt",
    ];
    if (validSortFields.includes(sortBy)) {
      orderBy[sortBy] = order === "asc" ? "asc" : "desc";
    } else {
      orderBy.createdAt = "desc";
    }

    // Fetch miners with user and space details
    const miners = await prisma.miner.findMany({
      where,
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
      },
      orderBy,
    });

    console.log(
      `[Miners API] GET: Successfully retrieved ${miners.length} miners`,
    );

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: miners,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Miners API] GET: Error - ${errorMsg}`);

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
 * POST /api/machine
 *
 * Create a new miner
 *
 * Request Body:
 * {
 *   name: string (required) - Miner name/identifier
 *   model: string (required) - Miner model (e.g., "Bitmain S21 Pro")
 *   powerUsage: number (required) - Power consumption in kilowatts
 *   hashRate: number (required) - Hash rate in TH/s
 *   userId: string (required) - ID of the user who owns this miner
 *   spaceId: string (required) - ID of the space where miner is located
 *   status: string (optional) - ACTIVE or INACTIVE (default: INACTIVE)
 * }
 *
 * Response: Created miner object
 *
 * Status Codes:
 * - 201: Created
 * - 400: Bad request
 * - 401: Unauthorized
 * - 403: Forbidden (not admin)
 * - 404: User or Space not found
 * - 500: Server error
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse>> {
  try {
    console.log("[Miners API] POST: Starting");

    // Verify admin authorization
    try {
      await verifyAdminAuth(request);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      console.error(`[Miners API] POST: ${errorMsg}`);

      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        {
          status: errorMsg.includes("Forbidden") ? 403 : 401,
        },
      );
    }

    const body = await request.json();
    const { name, model, powerUsage, hashRate, userId, spaceId, status } = body;

    // Validate required fields
    if (
      !name ||
      !model ||
      powerUsage === undefined ||
      hashRate === undefined ||
      !userId ||
      !spaceId
    ) {
      console.error("[Miners API] POST: Missing required fields");
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            "Missing required fields: name, model, powerUsage, hashRate, userId, spaceId",
        },
        { status: 400 },
      );
    }

    // Validate field types
    if (
      typeof name !== "string" ||
      typeof model !== "string" ||
      typeof userId !== "string" ||
      typeof spaceId !== "string"
    ) {
      console.error("[Miners API] POST: Invalid string field types");
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "name, model, userId, and spaceId must be strings",
        },
        { status: 400 },
      );
    }

    if (typeof powerUsage !== "number" || typeof hashRate !== "number") {
      console.error("[Miners API] POST: Invalid numeric field types");
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "powerUsage and hashRate must be numbers",
        },
        { status: 400 },
      );
    }

    // Validate values
    if (powerUsage <= 0 || hashRate <= 0) {
      console.error("[Miners API] POST: Invalid field values");
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "powerUsage and hashRate must be greater than 0",
        },
        { status: 400 },
      );
    }

    // Verify user exists
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!userExists) {
      console.error(`[Miners API] POST: User not found - ${userId}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    // Verify space exists
    const spaceExists = await prisma.space.findUnique({
      where: { id: spaceId },
      select: { id: true },
    });

    if (!spaceExists) {
      console.error(`[Miners API] POST: Space not found - ${spaceId}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Space not found" },
        { status: 404 },
      );
    }

    // Create miner
    const miner = await prisma.miner.create({
      data: {
        name: name.trim(),
        model: model.trim(),
        powerUsage,
        hashRate,
        userId,
        spaceId,
        status: status || "INACTIVE",
      },
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
      },
    });

    console.log(`[Miners API] POST: Created miner with id ${miner.id}`);

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: miner,
        timestamp: new Date().toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Miners API] POST: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 },
    );
  }
}
