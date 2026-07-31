/**
 * Pools API Routes
 *
 * Handles retrieval and creation of mining pools.
 * Admin access required for sensitive operations.
 *
 * Endpoints:
 * - GET /api/pools - Get all available pools
 * - POST /api/pools - Create a new pool (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

/**
 * Helper: Verify admin authorization
 */
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

    return { userId: decoded.userId, role: decoded.role };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Invalid token");
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const preferredRegion = "iad1";

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
 * Pool object from database
 */
export interface Pool {
  id: string;
  name: string;
  apiUrl: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /api/pools
 *
 * Retrieve all available mining pools
 *
 * Response: Array of pool objects
 *
 * Status Codes:
 * - 200: Success
 * - 401: Unauthorized
 * - 500: Server error
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse>> {
  try {
    console.log("[Pools API] GET: Starting");

    // Verify user is authenticated
    const token = request.cookies.get("token")?.value;

    if (!token) {
      console.error("[Pools API] GET: No token provided");
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Unauthorized: No token provided" },
        { status: 401 },
      );
    }

    try {
      await verifyJwtToken(token);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Invalid token";
      console.error(`[Pools API] GET: ${errorMsg}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        { status: 401 },
      );
    }

    // Fetch all pools
    const pools = await prisma.pool.findMany({
      select: {
        id: true,
        name: true,
        apiUrl: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    console.log(
      `[Pools API] GET: Successfully retrieved ${pools.length} pools`,
    );

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: pools,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Pools API] GET: Error - ${errorMsg}`);

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
 * POST /api/pools
 *
 * Create a new mining pool. Admin/Super Admin only.
 *
 * Request body: { name: string, apiUrl: string, description?: string }
 *
 * Status Codes:
 * - 201: Created
 * - 400: Bad request
 * - 401: Unauthorized
 * - 403: Forbidden (not admin)
 * - 409: Pool name already exists
 * - 500: Server error
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse>> {
  try {
    try {
      await verifyAdminAuth(request);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      console.error(`[Pools API] POST: ${errorMsg}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        { status: errorMsg.includes("Forbidden") ? 403 : 401 },
      );
    }

    const body = await request.json();
    const { name, apiUrl, description } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Pool name is required" },
        { status: 400 },
      );
    }

    if (!apiUrl || typeof apiUrl !== "string" || !apiUrl.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "apiUrl is required" },
        { status: 400 },
      );
    }

    const existing = await prisma.pool.findUnique({
      where: { name: name.trim() },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Pool "${name.trim()}" already exists` },
        { status: 409 },
      );
    }

    const pool = await prisma.pool.create({
      data: {
        name: name.trim(),
        apiUrl: apiUrl.trim(),
        description: description ? String(description).trim() : null,
      },
      select: {
        id: true,
        name: true,
        apiUrl: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log(
      `[Pools API] POST: Created pool "${pool.name}" (id: ${pool.id})`,
    );

    return NextResponse.json<ApiResponse>(
      { success: true, data: pool, timestamp: new Date().toISOString() },
      { status: 201 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Pools API] POST: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}
