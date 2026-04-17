/**
 * Pools API Routes
 *
 * Handles retrieval of available mining pools.
 * Admin access required for sensitive operations.
 *
 * Endpoints:
 * - GET /api/pools - Get all available pools
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

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
      const errorMsg =
        error instanceof Error ? error.message : "Invalid token";
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

    console.log(`[Pools API] GET: Successfully retrieved ${pools.length} pools`);

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
