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

    // Get all users with their luxor subaccount names
    const allUsers = await prisma.user.findMany({
      where: {
        isDeleted: false,
        luxorSubaccountName: { not: null },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        luxorSubaccountName: true,
        miners: {
          where: { isDeleted: false },
          select: { id: true },
        },
      },
    });

    // Map subaccounts in group with user details
    const subaccounts = group.subaccounts.map((groupSub) => {
      const user = allUsers.find(
        (u) => u.luxorSubaccountName === groupSub.subaccountName,
      );
      return {
        id: groupSub.id,
        subaccountName: groupSub.subaccountName,
        addedAt: groupSub.addedAt.toISOString(),
        user: {
          id: user?.id || "",
          name: user?.name || "Unknown",
          email: user?.email || "unknown@example.com",
          role: user?.role || "CLIENT",
          luxorSubaccountName:
            user?.luxorSubaccountName || groupSub.subaccountName,
        },
        minerCount: user?.miners.length || 0,
      };
    });

    // Get all subaccounts assigned to ANY group (globally)
    const allGroupedSubaccounts = await prisma.groupSubaccount.findMany({
      select: { subaccountName: true },
    });
    const allGroupedNames = allGroupedSubaccounts.map((s) => s.subaccountName);

    // Get available subaccounts (users not assigned to any group yet)
    const availableSubaccounts = allUsers
      .filter((u) => !allGroupedNames.includes(u.luxorSubaccountName || ""))
      .map((user) => ({
        id: user.id,
        subaccountName: user.luxorSubaccountName || "",
        addedAt: new Date().toISOString(),
        user: {
          id: user.id,
          name: user.name || "Unknown",
          email: user.email || "unknown@example.com",
          role: user.role,
          luxorSubaccountName: user.luxorSubaccountName || "",
        },
        minerCount: user.miners.length,
      }));

    console.log("[Groups API] GET[id] - Retrieved group:", id);

    return NextResponse.json(
      {
        success: true,
        data: {
          group: {
            id: group.id,
            name: group.name,
            relationshipManager: group.relationshipManager,
            email: group.email,
            description: group.description,
            isActive: group.isActive,
            createdAt: group.createdAt.toISOString(),
          },
          subaccounts,
          availableSubaccounts,
        },
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
 * Update a group's name, relationship manager, email, and description
 *
 * Request body:
 * {
 *   name?: string (required if updating)
 *   relationshipManager?: string (required if updating)
 *   email?: string (required if updating)
 *   description?: string (optional)
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
    const { name, relationshipManager, email, description, isActive } = body;

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

    if (relationshipManager !== undefined) {
      if (
        typeof relationshipManager !== "string" ||
        !relationshipManager.trim()
      ) {
        console.warn(
          "[Groups API] PUT[id] - Validation error: relationshipManager is invalid",
        );
        return NextResponse.json(
          {
            success: false,
            error: "Relationship Manager is required and must be non-empty",
          } as ApiResponse,
          { status: 400 },
        );
      }
      updateData.relationshipManager = relationshipManager.trim();
    }

    if (email !== undefined) {
      if (typeof email !== "string" || !email.trim()) {
        console.warn(
          "[Groups API] PUT[id] - Validation error: email is invalid",
        );
        return NextResponse.json(
          {
            success: false,
            error: "Email is required and must be non-empty",
          } as ApiResponse,
          { status: 400 },
        );
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        console.warn(
          "[Groups API] PUT[id] - Validation error: invalid email format",
        );
        return NextResponse.json(
          {
            success: false,
            error: "Invalid email format",
          } as ApiResponse,
          { status: 400 },
        );
      }

      updateData.email = email.trim();
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
