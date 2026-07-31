/**
 * Pool Auth Dynamic API Routes
 *
 * Handles PUT and DELETE operations for an individual client pool credential.
 * Admin/Super Admin only.
 *
 * Endpoints:
 * - PUT /api/pool-auth/[id] - Update a credential's authKey
 * - DELETE /api/pool-auth/[id] - Remove a client's credential for a pool
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
 * PUT /api/pool-auth/[id]
 *
 * Update the authKey for an existing client pool credential.
 *
 * Request body: { authKey: string }
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await context.params;

    try {
      await verifyAdminAuth(request);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      console.error(`[PoolAuth API] PUT: ${errorMsg}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        { status: errorMsg.includes("Forbidden") ? 403 : 401 },
      );
    }

    const existing = await prisma.poolAuth.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "PoolAuth not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { authKey } = body;

    if (!authKey || typeof authKey !== "string" || !authKey.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "authKey is required" },
        { status: 400 },
      );
    }

    const poolAuth = await prisma.poolAuth.update({
      where: { id },
      data: { authKey: authKey.trim() },
      select: {
        id: true,
        poolId: true,
        userId: true,
        authKey: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log(`[PoolAuth API] PUT: Updated PoolAuth (id: ${id})`);

    return NextResponse.json<ApiResponse>(
      { success: true, data: poolAuth, timestamp: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[PoolAuth API] PUT: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/pool-auth/[id]
 *
 * Remove a client's authentication credential for a pool.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await context.params;

    try {
      await verifyAdminAuth(request);
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      console.error(`[PoolAuth API] DELETE: ${errorMsg}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        { status: errorMsg.includes("Forbidden") ? 403 : 401 },
      );
    }

    const existing = await prisma.poolAuth.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "PoolAuth not found" },
        { status: 404 },
      );
    }

    await prisma.poolAuth.delete({ where: { id } });

    console.log(`[PoolAuth API] DELETE: Deleted PoolAuth (id: ${id})`);

    return NextResponse.json<ApiResponse>(
      { success: true, timestamp: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[PoolAuth API] DELETE: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}
