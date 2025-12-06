/**
 * Spaces API Routes
 *
 * Handles CRUD operations for mining spaces.
 * Only admins can perform these operations.
 *
 * Endpoints:
 * - GET /api/spaces - Get all spaces (admin only)
 * - POST /api/spaces - Create a new space (admin only)
 * - PUT /api/spaces/[id] - Update a space (admin only)
 * - DELETE /api/spaces/[id] - Delete a space (admin only)
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
 * GET /api/spaces
 *
 * Retrieve all mining spaces
 *
 * Query Parameters:
 * - status: Filter by status (AVAILABLE, OCCUPIED)
 * - sortBy: Sort field (name, capacity, powerCapacity, createdAt) - default: createdAt
 * - order: Sort order (asc, desc) - default: desc
 *
 * Response: Array of spaces with miner counts
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
    console.log("[Spaces API] GET: Starting");

    // Verify admin authorization
    try {
      await verifyAdminAuth(request);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      console.error(`[Spaces API] GET: ${errorMsg}`);

      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        {
          status: errorMsg.includes("Forbidden") ? 403 : 401,
        },
      );
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const order = searchParams.get("order") || "desc";

    // Build where clause for filtering
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (status) {
      where.status = status;
    }

    // Build order by clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderBy: any = {};
    if (
      sortBy === "name" ||
      sortBy === "capacity" ||
      sortBy === "powerCapacity" ||
      sortBy === "createdAt"
    ) {
      orderBy[sortBy] = order === "asc" ? "asc" : "desc";
    }

    // Fetch spaces with miner counts
    const spaces = await prisma.space.findMany({
      where,
      include: {
        miners: {
          select: {
            id: true,
            status: true,
            hardware: {
              select: {
                powerUsage: true,
              },
            },
          },
        },
      },
      orderBy:
        Object.keys(orderBy).length > 0 ? orderBy : { createdAt: "desc" },
    });

    // Format response with calculated fields
    const formattedSpaces = spaces.map((space) => {
      // Calculate total power usage
      const totalPowerUsage = space.miners.reduce((sum, m) => {
        return sum + (m.hardware?.powerUsage || 0);
      }, 0);
      const powerUsagePercentage =
        space.powerCapacity > 0
          ? ((totalPowerUsage / space.powerCapacity) * 100).toFixed(2)
          : "0.00";

      return {
        id: space.id,
        name: space.name,
        location: space.location,
        capacity: space.capacity,
        powerCapacity: space.powerCapacity,
        status: space.status,
        createdAt: space.createdAt,
        updatedAt: space.updatedAt,
        minerCount: space.miners.length,
        activeMinerCount: space.miners.filter((m) => m.status === "ACTIVE")
          .length,
        inactiveMinerCount: space.miners.filter((m) => m.status === "INACTIVE")
          .length,
        capacityUsed: space.miners.length,
        capacityPercentage: (
          (space.miners.length / space.capacity) *
          100
        ).toFixed(2),
        totalPowerUsage: parseFloat(totalPowerUsage.toFixed(2)),
        powerUsagePercentage,
      };
    });

    console.log(
      `[Spaces API] GET: Successfully retrieved ${formattedSpaces.length} spaces`,
    );

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: formattedSpaces,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Spaces API] GET: Error - ${errorMsg}`);

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
 * POST /api/spaces
 *
 * Create a new mining space
 *
 * Request Body:
 * {
 *   name: string (required)
 *   location: string (required)
 *   capacity: number (required) - Total mining spots
 *   powerCapacity: number (required) - Total power in kilowatts
 *   status: string (optional) - AVAILABLE or OCCUPIED (default: AVAILABLE)
 * }
 *
 * Response: Created space object
 *
 * Status Codes:
 * - 201: Created
 * - 400: Bad request
 * - 401: Unauthorized
 * - 403: Forbidden (not admin)
 * - 500: Server error
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse>> {
  try {
    console.log("[Spaces API] POST: Starting");

    // Verify admin authorization
    try {
      await verifyAdminAuth(request);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      console.error(`[Spaces API] POST: ${errorMsg}`);

      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        {
          status: errorMsg.includes("Forbidden") ? 403 : 401,
        },
      );
    }

    const body = await request.json();
    const { name, location, capacity, powerCapacity, status } = body;

    // Validate required fields
    if (
      !name ||
      !location ||
      capacity === undefined ||
      powerCapacity === undefined
    ) {
      console.error("[Spaces API] POST: Missing required fields");
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            "Missing required fields: name, location, capacity, powerCapacity",
        },
        { status: 400 },
      );
    }

    // Validate field types
    if (typeof name !== "string" || typeof location !== "string") {
      console.error("[Spaces API] POST: Invalid field types");
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "Invalid field types: name and location must be strings",
        },
        { status: 400 },
      );
    }

    if (typeof capacity !== "number" || typeof powerCapacity !== "number") {
      console.error("[Spaces API] POST: Invalid numeric fields");
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            "Invalid numeric fields: capacity and powerCapacity must be numbers",
        },
        { status: 400 },
      );
    }

    // Validate values
    if (capacity <= 0 || powerCapacity <= 0) {
      console.error("[Spaces API] POST: Invalid field values");
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "capacity and powerCapacity must be greater than 0",
        },
        { status: 400 },
      );
    }

    // Create space
    const space = await prisma.space.create({
      data: {
        name: name.trim(),
        location: location.trim(),
        capacity,
        powerCapacity,
        status: status || "AVAILABLE",
      },
      include: {
        miners: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    console.log(`[Spaces API] POST: Created space with id ${space.id}`);

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          ...space,
          minerCount: space.miners.length,
          activeMinerCount: space.miners.filter((m) => m.status === "ACTIVE")
            .length,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Spaces API] POST: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 },
    );
  }
}
