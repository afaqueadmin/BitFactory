/**
 * Pool Auth API Routes
 *
 * Handles creation of a client's pool authentication credential
 * (e.g. Luxor subaccount name, Braiins API token). Admin/Super Admin only.
 *
 * Endpoints:
 * - GET /api/pool-auth?poolId=... - List client credentials for a pool
 * - POST /api/pool-auth - Create or update (upsert) a client's credential for a pool
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const preferredRegion = "iad1";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
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

    return { userId: decoded.userId, role: decoded.role };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Invalid token");
  }
}

/**
 * GET /api/pool-auth?poolId=... | ?userId=...
 *
 * List client credentials for a given pool, or all pool credentials for a
 * given client. Exactly one of poolId/userId must be provided.
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse>> {
  try {
    try {
      await verifyAdminAuth(request);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      console.error(`[PoolAuth API] GET: ${errorMsg}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        { status: errorMsg.includes("Forbidden") ? 403 : 401 },
      );
    }

    const poolId = request.nextUrl.searchParams.get("poolId");
    const userId = request.nextUrl.searchParams.get("userId");

    if (!poolId && !userId) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "Either poolId or userId query parameter is required",
        },
        { status: 400 },
      );
    }

    const poolAuths = await prisma.poolAuth.findMany({
      where: poolId ? { poolId } : { userId: userId! },
      select: {
        id: true,
        poolId: true,
        userId: true,
        authKey: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, email: true } },
        pool: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json<ApiResponse>(
      { success: true, data: poolAuths, timestamp: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[PoolAuth API] GET: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}

/**
 * POST /api/pool-auth
 *
 * Create or update (upsert) a client's authentication credential for a pool.
 *
 * Request body: { poolId: string, userId: string, authKey: string }
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
      console.error(`[PoolAuth API] POST: ${errorMsg}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        { status: errorMsg.includes("Forbidden") ? 403 : 401 },
      );
    }

    const body = await request.json();
    const { poolId, userId, authKey } = body;

    if (!poolId || typeof poolId !== "string") {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "poolId is required" },
        { status: 400 },
      );
    }

    if (!userId || typeof userId !== "string") {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "userId is required" },
        { status: 400 },
      );
    }

    if (!authKey || typeof authKey !== "string" || !authKey.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "authKey is required" },
        { status: 400 },
      );
    }

    const [pool, user] = await Promise.all([
      prisma.pool.findUnique({ where: { id: poolId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    ]);

    if (!pool) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Pool not found" },
        { status: 404 },
      );
    }

    if (!user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    const poolAuth = await prisma.poolAuth.upsert({
      where: { poolId_userId: { poolId, userId } },
      create: { poolId, userId, authKey: authKey.trim() },
      update: { authKey: authKey.trim() },
      select: {
        id: true,
        poolId: true,
        userId: true,
        authKey: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log(
      `[PoolAuth API] POST: Upserted PoolAuth (pool: ${poolId}, user: ${userId})`,
    );

    return NextResponse.json<ApiResponse>(
      { success: true, data: poolAuth, timestamp: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[PoolAuth API] POST: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}
