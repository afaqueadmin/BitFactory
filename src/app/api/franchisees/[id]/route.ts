/**
 * src/app/api/franchisees/[id]/route.ts
 * Single Franchise Management API Routes (PUT, DELETE)
 *
 * Endpoints:
 * - PUT /api/franchisees/[id] - Update a franchise's business details
 * - DELETE /api/franchisees/[id] - Soft-delete a franchise
 *
 * Authorization: Super Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction, Prisma } from "@prisma/client";
import { logPoolCredentialChange } from "@/lib/audit/logPoolCredentialChange";
import {
  LuxorSubaccountConflictError,
  SUBACCOUNT_TX_OPTIONS,
  normalizeSubaccountNames,
  setLuxorSubaccounts,
} from "@/lib/luxorSubaccounts";

interface ApiResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

const franchiseInclude = {
  franchisee: {
    select: {
      id: true,
      name: true,
      email: true,
      poolAuths: {
        where: { pool: { name: "Luxor" } },
        orderBy: { createdAt: "asc" },
        select: { authKey: true },
      },
    },
  },
  createdBy: { select: { id: true, name: true, email: true } },
  _count: { select: { users: true } },
} satisfies Prisma.FranchiseInclude;

/** Flattens the franchisee's Luxor PoolAuth rows into luxorSubaccounts. */
function withLuxorSubaccounts(
  franchise: Prisma.FranchiseGetPayload<{ include: typeof franchiseInclude }>,
) {
  const { poolAuths, ...franchisee } = franchise.franchisee;
  return {
    ...franchise,
    franchisee: {
      ...franchisee,
      luxorSubaccounts: poolAuths.map((pa) => pa.authKey),
    },
  };
}

async function getAuthenticatedUser(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return null;
    }
    return await verifyJwtToken(token);
  } catch {
    return null;
  }
}

/**
 * GET /api/franchisees/[id]
 * Fetch a single franchise's details, including owner and creator info
 *
 * Authorization: Admin/Super Admin only
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse,
        { status: 401 },
      );
    }

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Admin/Super Admin can view franchisees",
        } as ApiResponse,
        { status: 403 },
      );
    }

    const franchise = await prisma.franchise.findUnique({
      where: { id },
      include: franchiseInclude,
    });

    if (!franchise || franchise.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Franchise not found" } as ApiResponse,
        { status: 404 },
      );
    }

    return NextResponse.json(
      { success: true, data: withLuxorSubaccounts(franchise) } as ApiResponse,
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Franchisees API] GET[id] - Error:", errorMsg);
    return NextResponse.json(
      { success: false, error: errorMsg } as ApiResponse,
      { status: 500 },
    );
  }
}

/**
 * PUT /api/franchisees/[id]
 * Update a franchise's business details
 *
 * Request body (all optional, only provided fields are updated):
 * {
 *   businessName?: string
 *   authorizedPersonName?: string
 *   email?: string
 *   phoneNumber?: string
 *   address?: string
 *   city?: string
 *   state?: string
 *   postalCode?: string
 *   isActive?: boolean
 *   luxorSubaccountNames?: string[]   - the franchisee's full set of Luxor subaccounts
 * }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse,
        { status: 401 },
      );
    }

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Admin/Super Admin can edit franchisees",
        } as ApiResponse,
        { status: 403 },
      );
    }

    const existingFranchise = await prisma.franchise.findUnique({
      where: { id },
    });

    if (!existingFranchise || existingFranchise.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Franchise not found" } as ApiResponse,
        { status: 404 },
      );
    }

    const body = await request.json();
    const {
      businessName,
      authorizedPersonName,
      email,
      phoneNumber,
      address,
      city,
      state,
      postalCode,
      isActive,
      luxorSubaccountNames: rawLuxorSubaccountNames,
      braiinsAuthKey,
    } = body;
    const luxorSubaccountNames = normalizeSubaccountNames(
      rawLuxorSubaccountNames,
    );

    const stringFields: Record<string, unknown> = {
      businessName,
      authorizedPersonName,
      email,
      phoneNumber,
      address,
      city,
      state,
      postalCode,
    };

    const updateData: Record<string, unknown> = {};

    for (const [field, value] of Object.entries(stringFields)) {
      if (value !== undefined) {
        if (typeof value !== "string" || !value.trim()) {
          return NextResponse.json(
            {
              success: false,
              error: `${field} must be a non-empty string`,
            } as ApiResponse,
            { status: 400 },
          );
        }
        updateData[field] = value.trim();
      }
    }

    if (updateData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updateData.email as string)) {
        return NextResponse.json(
          { success: false, error: "Invalid email format" } as ApiResponse,
          { status: 400 },
        );
      }
    }

    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return NextResponse.json(
          {
            success: false,
            error: "isActive must be a boolean",
          } as ApiResponse,
          { status: 400 },
        );
      }
      updateData.isActive = isActive;
    }

    if (luxorSubaccountNames !== null) {
      try {
        await prisma.$transaction(
          (tx) =>
            setLuxorSubaccounts(tx, {
              userId: existingFranchise.franchiseeId,
              names: luxorSubaccountNames,
              actorId: user.userId,
            }),
          SUBACCOUNT_TX_OPTIONS,
        );
      } catch (poolAuthError) {
        if (poolAuthError instanceof LuxorSubaccountConflictError) {
          return NextResponse.json(
            { success: false, error: poolAuthError.message } as ApiResponse,
            { status: 409 },
          );
        }
        throw poolAuthError;
      }
    }

    // Sync the Braiins credential when the field is explicitly provided:
    // a non-empty value upserts it, an empty/null value removes it.
    if (braiinsAuthKey !== undefined) {
      try {
        const braiinsPool = await prisma.pool.findUnique({
          where: { name: "Braiins" },
          select: { id: true },
        });
        if (braiinsPool) {
          if (braiinsAuthKey && String(braiinsAuthKey).trim()) {
            const existingBraiinsAuth = await prisma.poolAuth.findFirst({
              where: {
                poolId: braiinsPool.id,
                userId: existingFranchise.franchiseeId,
              },
              select: { id: true },
            });
            if (existingBraiinsAuth) {
              await prisma.poolAuth.update({
                where: { id: existingBraiinsAuth.id },
                data: { authKey: String(braiinsAuthKey).trim() },
              });
            } else {
              await prisma.poolAuth.create({
                data: {
                  poolId: braiinsPool.id,
                  userId: existingFranchise.franchiseeId,
                  authKey: String(braiinsAuthKey).trim(),
                },
              });
            }
            await logPoolCredentialChange(prisma, {
              action: existingBraiinsAuth
                ? AuditAction.POOL_CREDENTIAL_UPDATED
                : AuditAction.POOL_CREDENTIAL_ADDED,
              userId: existingFranchise.franchiseeId,
              actorId: user.userId,
              poolName: "Braiins",
            });
          } else {
            const removed = await prisma.poolAuth.deleteMany({
              where: {
                poolId: braiinsPool.id,
                userId: existingFranchise.franchiseeId,
              },
            });
            if (removed.count > 0) {
              await logPoolCredentialChange(prisma, {
                action: AuditAction.POOL_CREDENTIAL_REMOVED,
                userId: existingFranchise.franchiseeId,
                actorId: user.userId,
                poolName: "Braiins",
              });
            }
          }
        }
      } catch (braiinsError) {
        console.error(
          "[Franchisees API] Failed to sync Braiins credential:",
          braiinsError,
        );
        // Don't fail the franchise update if this fails
      }
    }

    const updatedFranchise = await prisma.franchise.update({
      where: { id },
      data: updateData,
      include: franchiseInclude,
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.FRANCHISE_UPDATED,
        entityType: "Franchise",
        entityId: updatedFranchise.id,
        userId: user.userId,
        description: `Franchise ${updatedFranchise.businessName} updated`,
        changes: JSON.stringify(updateData),
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: withLuxorSubaccounts(updatedFranchise),
        message: "Franchise updated successfully",
      } as ApiResponse,
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Franchisees API] PUT[id] - Error:", errorMsg);
    return NextResponse.json(
      { success: false, error: errorMsg } as ApiResponse,
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/franchisees/[id]
 * Soft-delete a franchise (sets deletedAt and isActive: false)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse,
        { status: 401 },
      );
    }

    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Super Admin can delete franchisees",
        } as ApiResponse,
        { status: 403 },
      );
    }

    const existingFranchise = await prisma.franchise.findUnique({
      where: { id },
    });

    if (!existingFranchise || existingFranchise.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Franchise not found" } as ApiResponse,
        { status: 404 },
      );
    }

    const deletedFranchise = await prisma.franchise.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.FRANCHISE_DELETED,
        entityType: "Franchise",
        entityId: deletedFranchise.id,
        userId: user.userId,
        description: `Franchise ${deletedFranchise.businessName} deleted`,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: deletedFranchise,
        message: "Franchise deleted successfully",
      } as ApiResponse,
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Franchisees API] DELETE[id] - Error:", errorMsg);
    return NextResponse.json(
      { success: false, error: errorMsg } as ApiResponse,
      { status: 500 },
    );
  }
}
