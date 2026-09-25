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
import { AuditAction } from "@prisma/client";
import { logPoolCredentialChange } from "@/lib/audit/logPoolCredentialChange";
import {
  SUBACCOUNT_TX_OPTIONS,
  setLuxorSubaccounts,
} from "@/lib/luxorSubaccounts";

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

    let actorUserId: string;
    try {
      ({ userId: actorUserId } = await verifyAdminAuth(request));
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      console.error(`[PoolAuth API] PUT: ${errorMsg}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        { status: errorMsg.includes("Forbidden") ? 403 : 401 },
      );
    }

    const existing = await prisma.poolAuth.findUnique({
      where: { id },
      include: { pool: { select: { name: true } } },
    });
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

    // A subaccount/token belongs to one user per pool (@@unique([poolId, authKey])).
    const taken = await prisma.poolAuth.findUnique({
      where: {
        poolId_authKey: { poolId: existing.poolId, authKey: authKey.trim() },
      },
      select: { id: true, userId: true },
    });
    if (taken && taken.id !== id) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            taken.userId === existing.userId
              ? "This subaccount is already assigned to this user"
              : "This subaccount is already assigned to another user",
        },
        { status: 409 },
      );
    }

    const poolAuth = await prisma.$transaction(async (tx) => {
      const updated = await tx.poolAuth.update({
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
      // GroupSubaccount keeps a copy of the name - keep it in step.
      await tx.groupSubaccount.updateMany({
        where: { poolAuthId: id },
        data: { subaccountName: updated.authKey },
      });
      await logPoolCredentialChange(tx, {
        action: AuditAction.POOL_CREDENTIAL_UPDATED,
        userId: existing.userId,
        actorId: actorUserId,
        poolName: existing.pool.name,
        ...(existing.pool.name === "Luxor"
          ? { credentialName: `${existing.authKey} -> ${updated.authKey}` }
          : {}),
      });
      return updated;
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

    let actorUserId: string;
    try {
      ({ userId: actorUserId } = await verifyAdminAuth(request));
    } catch (authError) {
      const errorMsg =
        authError instanceof Error ? authError.message : "Authorization failed";
      console.error(`[PoolAuth API] DELETE: ${errorMsg}`);
      return NextResponse.json<ApiResponse>(
        { success: false, error: errorMsg },
        { status: errorMsg.includes("Forbidden") ? 403 : 401 },
      );
    }

    const existing = await prisma.poolAuth.findUnique({
      where: { id },
      include: { pool: { select: { name: true } } },
    });
    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "PoolAuth not found" },
        { status: 404 },
      );
    }

    if (existing.pool.name === "Luxor") {
      // Same path as the customer edit form, so group membership follows
      // the same rules wherever a Luxor subaccount is removed from.
      await prisma.$transaction(async (tx) => {
        const current = await tx.poolAuth.findMany({
          where: { poolId: existing.poolId, userId: existing.userId },
          select: { authKey: true },
        });
        await setLuxorSubaccounts(tx, {
          userId: existing.userId,
          names: current
            .map((c) => c.authKey)
            .filter((k) => k !== existing.authKey),
          actorId: actorUserId,
        });
      }, SUBACCOUNT_TX_OPTIONS);
    } else {
      await prisma.$transaction(async (tx) => {
        // Drop its group membership rows too - the FK is ON DELETE SET NULL,
        // which would otherwise leave an orphaned membership behind.
        const memberships = await tx.groupSubaccount.findMany({
          where: { poolAuthId: id },
          select: { groupId: true },
        });
        await tx.groupSubaccount.deleteMany({ where: { poolAuthId: id } });
        for (const m of memberships) {
          await tx.auditLog.create({
            data: {
              action: AuditAction.GROUP_SUBACCOUNT_REMOVED,
              entityType: "Group",
              entityId: m.groupId,
              userId: actorUserId,
              description: `${existing.pool.name} credential removed from group`,
            },
          });
        }
        await tx.poolAuth.delete({ where: { id } });
        await logPoolCredentialChange(tx, {
          action: AuditAction.POOL_CREDENTIAL_REMOVED,
          userId: existing.userId,
          actorId: actorUserId,
          poolName: existing.pool.name,
        });
      });
    }

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
