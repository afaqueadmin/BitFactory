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

interface ApiResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
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

    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Super Admin can edit franchisees",
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
    } = body;

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

    const updatedFranchise = await prisma.franchise.update({
      where: { id },
      data: updateData,
      include: {
        franchisee: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { users: true } },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: updatedFranchise,
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
