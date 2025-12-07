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
            luxorSubaccountName: true,
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
        rateHistory: {
          select: {
            rate_per_kwh: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
      orderBy,
    });

    // Transform miners to include latest rate_per_kwh
    const transformedMiners = miners.map((miner) => ({
      ...miner,
      rate_per_kwh:
        miner.rateHistory && miner.rateHistory.length > 0
          ? miner.rateHistory[0].rate_per_kwh
          : undefined,
      rateHistory: undefined, // Remove the rateHistory array from response
    }));

    console.log(
      `[Miners API] GET: Successfully retrieved ${transformedMiners.length} miners`,
    );

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: transformedMiners,
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
 *   hardwareId: string (required) - Hardware model ID
 *   userId: string (required) - ID of the user who owns this miner
 *   spaceId: string (required) - ID of the space where miner is located
 *   status: string (optional) - ACTIVE or INACTIVE (default: INACTIVE)
 *   rate_per_kwh: number (required) - Electricity rate per kWh in USD (positive number)
 * }
 *
 * Response: Created miner object
 *
 * Status Codes:
 * - 201: Created
 * - 400: Bad request
 * - 401: Unauthorized
 * - 403: Forbidden (not admin)
 * - 404: User, Space, or Hardware not found
 * - 409: Conflict (miner name exists, no hardware quantity available)
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
    const { name, hardwareId, userId, spaceId, status, rate_per_kwh } = body;

    // Validate required fields
    if (!name || !hardwareId || !userId || !spaceId) {
      console.error("[Miners API] POST: Missing required fields");
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "Missing required fields: name, hardwareId, userId, spaceId",
        },
        { status: 400 },
      );
    }

    // Validate rate_per_kwh is provided
    if (
      rate_per_kwh === null ||
      rate_per_kwh === undefined ||
      rate_per_kwh === ""
    ) {
      console.error("[Miners API] POST: rate_per_kwh is required");
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "rate_per_kwh is required",
        },
        { status: 400 },
      );
    }

    // Validate field types
    if (
      typeof name !== "string" ||
      typeof hardwareId !== "string" ||
      typeof userId !== "string" ||
      typeof spaceId !== "string"
    ) {
      console.error("[Miners API] POST: Invalid string field types");
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "name, hardwareId, userId, and spaceId must be strings",
        },
        { status: 400 },
      );
    }

    // Validate rate_per_kwh is a positive number
    const ratePerKwh = Number(rate_per_kwh);
    if (isNaN(ratePerKwh) || ratePerKwh <= 0) {
      console.error(
        "[Miners API] POST: Invalid rate_per_kwh - must be positive number",
      );
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "rate_per_kwh must be a positive number",
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

    // Check if miner name is unique for this user
    const existingMinerWithName = await prisma.miner.findUnique({
      where: {
        name_userId: {
          name: name.trim(),
          userId,
        },
      },
      select: { id: true },
    });

    if (existingMinerWithName) {
      console.error(
        `[Miners API] POST: Miner name already exists for this user - ${name}`,
      );
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "A miner with this name already exists for this user",
        },
        { status: 409 },
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

    // Verify hardware exists
    const hardwareExists = await prisma.hardware.findUnique({
      where: { id: hardwareId },
      select: { id: true, quantity: true },
    });

    if (!hardwareExists) {
      console.error(`[Miners API] POST: Hardware not found - ${hardwareId}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Hardware not found" },
        { status: 404 },
      );
    }

    // Check if hardware has available quantity
    if (hardwareExists.quantity <= 0) {
      console.error(
        `[Miners API] POST: No available quantity for hardware - ${hardwareId}`,
      );
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "No available hardware units of this model",
        },
        { status: 409 },
      );
    }

    // Create miner and reduce hardware quantity in transaction
    const miner = await prisma.$transaction(async (tx) => {
      // Create the miner
      const newMiner = await tx.miner.create({
        data: {
          name: name.trim(),
          hardwareId,
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
              luxorSubaccountName: true,
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

      // Create miner rate history entry
      await tx.minerRateHistory.create({
        data: {
          minerId: newMiner.id,
          rate_per_kwh: ratePerKwh,
        },
      });

      // Reduce hardware quantity
      await tx.hardware.update({
        where: { id: hardwareId },
        data: {
          quantity: {
            decrement: 1,
          },
        },
      });

      return newMiner;
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
