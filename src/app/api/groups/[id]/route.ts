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
import { franchiseeUserFilter } from "@/lib/franchiseeScope";

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
    if (
      user.role !== "ADMIN" &&
      user.role !== "SUPER_ADMIN" &&
      user.role !== "FRANCHISEE"
    ) {
      console.warn("[Groups API] GET[id] - Forbidden: User role is", user.role);
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Admin/Super Admin can access groups",
        } as ApiResponse,
        { status: 403 },
      );
    }

    // Fetch group with subaccounts (via poolAuth -> user relation, or
    // directly via userId for subaccount-less members) and creator
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        subaccounts: {
          include: {
            poolAuth: {
              include: {
                user: {
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
                },
              },
            },
            user: {
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
            },
          },
        },
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

    // Map subaccounts in group with user details (via the poolAuth relation,
    // or directly via the user relation for subaccount-less members)
    const subaccounts = group.subaccounts.map((groupSub) => {
      const member = groupSub.poolAuth?.user || groupSub.user;
      return {
        id: groupSub.id,
        subaccountName: groupSub.subaccountName,
        poolAuthId: groupSub.poolAuthId || undefined,
        userId: groupSub.userId || undefined,
        addedAt: groupSub.addedAt.toISOString(),
        user: {
          id: member?.id || "",
          name: member?.name || "Unknown",
          email: member?.email || "unknown@example.com",
          role: member?.role || "CLIENT",
          luxorSubaccountName:
            member?.luxorSubaccountName || groupSub.subaccountName || "",
        },
        minerCount: member?.miners.length || 0,
      };
    });

    // Get all PoolAuth ids and user ids already assigned to ANY group (globally)
    const allGroupedSubaccounts = await prisma.groupSubaccount.findMany({
      select: { poolAuthId: true, userId: true },
    });
    const groupedPoolAuthIds = new Set(
      allGroupedSubaccounts
        .map((s) => s.poolAuthId)
        .filter((pid): pid is string => !!pid),
    );
    const groupedUserIds = new Set(
      allGroupedSubaccounts
        .map((s) => s.userId)
        .filter((uid): uid is string => !!uid),
    );

    // Get available subaccounts (PoolAuth rows not assigned to any group yet)
    const allPoolAuths = await prisma.poolAuth.findMany({
      where: {
        user: {
          isDeleted: false,
          ...franchiseeUserFilter({ id: user.userId, role: user.role }),
        },
      },
      select: {
        id: true,
        authKey: true,
        user: {
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
        },
      },
    });

    const availableSubaccounts = allPoolAuths
      .filter((pa) => !groupedPoolAuthIds.has(pa.id))
      .map((pa) => ({
        id: pa.id,
        poolAuthId: pa.id,
        subaccountName: pa.authKey,
        addedAt: new Date().toISOString(),
        user: {
          id: pa.user.id,
          name: pa.user.name || "Unknown",
          email: pa.user.email || "unknown@example.com",
          role: pa.user.role,
          luxorSubaccountName: pa.user.luxorSubaccountName || "",
        },
        minerCount: pa.user.miners.length,
      }));

    // CLIENT users with no Luxor subaccount can still be added directly
    // (userId-based membership) - list those not already in a group.
    const subaccountlessUsers = await prisma.user.findMany({
      where: {
        role: "CLIENT",
        isDeleted: false,
        poolAuths: { none: {} },
        id: { notIn: Array.from(groupedUserIds) },
        ...franchiseeUserFilter({ id: user.userId, role: user.role }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        luxorSubaccountName: true,
        miners: { where: { isDeleted: false }, select: { id: true } },
      },
    });

    const availableUsers = subaccountlessUsers.map((u) => ({
      id: u.id,
      userId: u.id,
      subaccountName: null,
      addedAt: new Date().toISOString(),
      user: {
        id: u.id,
        name: u.name || "Unknown",
        email: u.email || "unknown@example.com",
        role: u.role,
        luxorSubaccountName: u.luxorSubaccountName || "",
      },
      minerCount: u.miners.length,
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
          availableSubaccounts: [...availableSubaccounts, ...availableUsers],
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
