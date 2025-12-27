/**
 * src/app/api/groups/[id]/route.ts
 * Group Management API Routes (GET, PUT, DELETE)
 *
 * Endpoints:
 * - GET /api/groups/[id] - Get a single group with subaccounts
 * - PUT /api/groups/[id] - Update a group
 * - DELETE /api/groups/[id] - Delete a group (and remove subaccount associations)
 *
 * Authorization: Admin/Super Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

/**
 * API Response Type
 */
interface ApiResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Helper: Extract and verify JWT token from request cookies
 */
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
 * GET /api/groups/[id]
 * Get a single group with all its subaccounts
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    console.log("[Groups API] GET /api/groups/[id] - Fetching group:", id);

    // Get authenticated user
    const user = await getAuthenticatedUser(request);

    if (!user) {
      console.warn("[Groups API] GET[id] - Unauthorized: No user session");
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        } as ApiResponse,
        { status: 401 },
      );
    }

    // Check authorization
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      console.warn("[Groups API] GET[id] - Forbidden: User role is", user.role);
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Admin/Super Admin can access groups",
        } as ApiResponse,
        { status: 403 },
      );
    }

    // Fetch group with subaccounts and creator
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        subaccounts: true,
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            subaccounts: true,
          },
        },
      },
    });

    if (!group) {
      console.warn("[Groups API] GET[id] - Group not found:", id);
      return NextResponse.json(
        {
          success: false,
          error: "Group not found",
        } as ApiResponse,
        { status: 404 },
      );
    }

    console.log("[Groups API] GET[id] - Retrieved group:", id);

    return NextResponse.json(
      {
        success: true,
        data: group,
      } as ApiResponse,
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Groups API] GET[id] - Error:", errorMsg);

    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      } as ApiResponse,
      { status: 500 },
    );
  }
}

/**
 * PUT /api/groups/[id]
 * Update a group's name and description
 *
 * Request body:
 * {
 *   name?: string
 *   description?: string
 *   isActive?: boolean
 * }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    console.log("[Groups API] PUT /api/groups/[id] - Updating group:", id);

    // Get authenticated user
    const user = await getAuthenticatedUser(request);

    if (!user) {
      console.warn("[Groups API] PUT[id] - Unauthorized: No user session");
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        } as ApiResponse,
        { status: 401 },
      );
    }

    // Check authorization
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      console.warn("[Groups API] PUT[id] - Forbidden: User role is", user.role);
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Admin/Super Admin can update groups",
        } as ApiResponse,
        { status: 403 },
      );
    }

    // Check if group exists
    const existingGroup = await prisma.group.findUnique({
      where: { id },
    });

    if (!existingGroup) {
      console.warn("[Groups API] PUT[id] - Group not found:", id);
      return NextResponse.json(
        {
          success: false,
          error: "Group not found",
        } as ApiResponse,
        { status: 404 },
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, description, isActive } = body;

    // Build update data
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        console.warn(
          "[Groups API] PUT[id] - Validation error: name is invalid",
        );
        return NextResponse.json(
          {
            success: false,
            error: "Group name is required and must be non-empty",
          } as ApiResponse,
          { status: 400 },
        );
      }
      updateData.name = name.trim();
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    if (isActive !== undefined && typeof isActive === "boolean") {
      updateData.isActive = isActive;
    }

    console.log("[Groups API] PUT[id] - Updating group with data:", updateData);

    // Update group
    const updatedGroup = await prisma.group.update({
      where: { id },
      data: updateData,
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            subaccounts: true,
          },
        },
      },
    });

    console.log("[Groups API] PUT[id] - Group updated successfully:", id);

    return NextResponse.json(
      {
        success: true,
        data: updatedGroup,
        message: "Group updated successfully",
      } as ApiResponse,
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Groups API] PUT[id] - Error:", errorMsg);

    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      } as ApiResponse,
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/groups/[id]
 * Delete a group (subaccounts are not deleted, only their group association is removed due to CASCADE)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    console.log("[Groups API] DELETE /api/groups/[id] - Deleting group:", id);

    // Get authenticated user
    const user = await getAuthenticatedUser(request);

    if (!user) {
      console.warn("[Groups API] DELETE[id] - Unauthorized: No user session");
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        } as ApiResponse,
        { status: 401 },
      );
    }

    // Check authorization
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      console.warn(
        "[Groups API] DELETE[id] - Forbidden: User role is",
        user.role,
      );
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Admin/Super Admin can delete groups",
        } as ApiResponse,
        { status: 403 },
      );
    }

    // Check if group exists
    const existingGroup = await prisma.group.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            subaccounts: true,
          },
        },
      },
    });

    if (!existingGroup) {
      console.warn("[Groups API] DELETE[id] - Group not found:", id);
      return NextResponse.json(
        {
          success: false,
          error: "Group not found",
        } as ApiResponse,
        { status: 404 },
      );
    }

    console.log(
      "[Groups API] DELETE[id] - Deleting group with",
      existingGroup._count.subaccounts,
      "subaccounts",
    );

    // Delete group (CASCADE will remove group_subaccounts associations)
    const deletedGroup = await prisma.group.delete({
      where: { id },
    });

    console.log("[Groups API] DELETE[id] - Group deleted successfully:", id);

    return NextResponse.json(
      {
        success: true,
        data: deletedGroup,
        message: "Group deleted successfully",
      } as ApiResponse,
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Groups API] DELETE[id] - Error:", errorMsg);

    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      } as ApiResponse,
      { status: 500 },
    );
  }
}
