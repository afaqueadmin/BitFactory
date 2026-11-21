/**
 * Pool Dynamic API Routes
 *
 * Handles PUT and DELETE operations for individual pools.
 * Admin/Super Admin only.
 *
 * Endpoints:
 * - PUT /api/pools/[id] - Update a pool
 * - DELETE /api/pools/[id] - Delete a pool
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationContext,
  requirePermission,
} from "@/lib/auth/authorization";

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

/**
 * PUT /api/pools/[id]
 *
 * Update a pool's name, apiUrl, or description.
 *
 * Request body: { name?: string, apiUrl?: string, description?: string | null }
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;

    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "pools.edit");
    if (denied) return denied;

    const existingPool = await prisma.pool.findUnique({ where: { id } });
    if (!existingPool) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Pool not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { name, apiUrl, description } = body;

    const updateData: {
      name?: string;
      apiUrl?: string;
      description?: string | null;
    } = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "Pool name must be a non-empty string" },
          { status: 400 },
        );
      }
      if (name.trim() !== existingPool.name) {
        const nameTaken = await prisma.pool.findUnique({
          where: { name: name.trim() },
          select: { id: true },
        });
        if (nameTaken) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: `Pool "${name.trim()}" already exists` },
            { status: 409 },
          );
        }
      }
      updateData.name = name.trim();
    }

    if (apiUrl !== undefined) {
      if (typeof apiUrl !== "string" || !apiUrl.trim()) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "apiUrl must be a non-empty string" },
          { status: 400 },
        );
      }
      updateData.apiUrl = apiUrl.trim();
    }

    if (description !== undefined) {
      updateData.description = description ? String(description).trim() : null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "No fields to update" },
        { status: 400 },
      );
    }

    const pool = await prisma.pool.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        apiUrl: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log(`[Pool API] PUT: Updated pool "${pool.name}" (id: ${pool.id})`);

    return NextResponse.json<ApiResponse>(
      { success: true, data: pool, timestamp: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Pool API] PUT: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/pools/[id]
 *
 * Delete a pool. Blocked if any Miner or PoolAuth still references it.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;

    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "pools.delete");
    if (denied) return denied;

    const existingPool = await prisma.pool.findUnique({ where: { id } });
    if (!existingPool) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Pool not found" },
        { status: 404 },
      );
    }

    const [minerCount, poolAuthCount] = await Promise.all([
      prisma.miner.count({ where: { poolId: id, isDeleted: false } }),
      prisma.poolAuth.count({ where: { poolId: id } }),
    ]);

    if (minerCount > 0 || poolAuthCount > 0) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: `Cannot delete pool "${existingPool.name}": it is still referenced by ${minerCount} miner(s) and ${poolAuthCount} client credential(s). Reassign or remove those first.`,
        },
        { status: 409 },
      );
    }

    await prisma.pool.delete({ where: { id } });

    console.log(
      `[Pool API] DELETE: Deleted pool "${existingPool.name}" (id: ${id})`,
    );

    return NextResponse.json<ApiResponse>(
      { success: true, timestamp: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Internal server error";
    console.error(`[Pool API] DELETE: Error - ${errorMsg}`);

    return NextResponse.json<ApiResponse>(
      { success: false, error: errorMsg },
      { status: 500 },
    );
  }
}
