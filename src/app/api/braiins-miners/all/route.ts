/**
 * src/app/api/braiins-miners/all/route.ts
 * Fetch all Braiins miners across all clients (admin-only)
 *
 * This endpoint returns a list of all miners that:
 * 1. Have pool.name === "Braiins"
 * 2. Have poolAuth configured (valid Braiins API token)
 *
 * Used by admin page to display all Braiins miners for worker management
 *
 * Response format:
 * {
 *   success: boolean,
 *   data?: { miners: Array<{ id, name, userId, userName }> },
 *   error?: string
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

interface ProxyResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

interface BraiinsMinerInfo {
  id: string;
  name: string;
  userId: string;
  userName: string;
}

/**
 * Helper: Extract and validate JWT token from request cookies
 */
async function extractUserFromToken(request: NextRequest) {
  const token = request.cookies.get("token")?.value;

  if (!token) {
    throw new Error("Authentication required: No token found");
  }

  try {
    const decoded = await verifyJwtToken(token);

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      throw new Error("User not found in database");
    }

    // Check if user is admin
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      throw new Error("Admin access required");
    }

    return {
      userId: decoded.userId,
      role: decoded.role,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Authentication failed: Invalid or expired token");
  }
}

/**
 * GET /api/braiins-miners/all
 *
 * Fetches all Braiins miners across all clients
 * Admin-only endpoint
 *
 * Response: Array of miners with id, name, userId, userName
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<ProxyResponse<Record<string, unknown>>>> {
  try {
    // ✅ STEP 1: Authenticate and verify admin role
    console.log("[Braiins Miners All] GET: Authenticating user...");
    let user: {
      userId: string;
      role: string;
    };

    try {
      user = await extractUserFromToken(request);
      console.log(
        `[Braiins Miners All] GET: Admin authenticated: ${user.userId}`,
      );
    } catch (authError) {
      const errorMsg =
        authError instanceof Error
          ? authError.message
          : "Authentication failed";
      console.error(`[Braiins Miners All] GET: ${errorMsg}`);
      return NextResponse.json<ProxyResponse>(
        { success: false, error: errorMsg },
        { status: 401 },
      );
    }

    // ✅ STEP 2: Fetch all Braiins miners from all clients
    console.log(
      "[Braiins Miners All] GET: Fetching all Braiins miners from database...",
    );

    const miners = await prisma.miner.findMany({
      where: {
        pool: {
          name: "Braiins",
        },
        poolAuth: {
          not: null, // Only miners with poolAuth configured
        },
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ user: { name: "asc" } }, { name: "asc" }],
    });

    console.log(
      `[Braiins Miners All] GET: Found ${miners.length} Braiins miners with configured poolAuth`,
    );

    // ✅ STEP 3: Format response
    const minersList: BraiinsMinerInfo[] = miners.map((miner) => ({
      id: miner.id,
      name: miner.name,
      userId: miner.userId,
      userName: miner.user?.name || "Unknown User",
    }));

    console.log(
      "[Braiins Miners All] GET: Successfully retrieved all Braiins miners",
    );

    return NextResponse.json<ProxyResponse<Record<string, unknown>>>(
      {
        success: true,
        data: {
          miners: minersList,
        } as unknown as Record<string, unknown>,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Braiins Miners All] GET: Unhandled error: ${errorMsg}`);

    return NextResponse.json<ProxyResponse>(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 },
    );
  }
}

/**
 * OPTIONS handler for CORS preflight requests
 */
export async function OPTIONS(): Promise<NextResponse> {
  return NextResponse.json(
    {},
    {
      headers: {
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}
