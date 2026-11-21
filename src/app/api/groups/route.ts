/**
 * src/app/api/groups/route.ts
 * Group Management API Routes (GET, POST)
 *
 * Endpoints:
 * - GET /api/groups - List all groups with subaccount counts
 * - POST /api/groups - Create a new group
 *
 * Authorization: Admin/Super Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationContext,
  requireAnyPermission,
  requirePermission,
} from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";

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
 * GET /api/groups
 * List all groups with subaccount counts
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    console.log("[Groups API] GET /api/groups - Fetching all groups");

    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requireAnyPermission(ctx, [
      "customer_groups.view",
      "customers.create",
      "customers.edit",
    ]);
    if (denied) return denied;

    // Fetch all groups with subaccount count and creator info
    const groups = await prisma.group.findMany({
      include: {
        _count: {
          select: {
            subaccounts: true,
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    console.log("[Groups API] GET - Retrieved", groups.length, "groups");

    return NextResponse.json(
      {
        success: true,
        data: groups,
      } as unknown as ApiResponse,
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Groups API] GET - Error:", errorMsg);

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
 * POST /api/groups
 * Create a new group
 *
 * Request body:
 * {
 *   name: string (required)
 *   relationshipManager: string (required)
 *   email: string (required)
 *   description?: string (optional)
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    console.log("[Groups API] POST /api/groups - Creating new group");

    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "customer_groups.create");
    if (denied) return denied;
    const user = { userId: ctx.userId, role: ctx.role };

    // Parse request body
    const body = await request.json();
    const { name, relationshipManager, email, description } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || !name.trim()) {
      console.warn("[Groups API] POST - Validation error: name is required");
      return NextResponse.json(
        {
          success: false,
          error: "Group name is required",
        } as ApiResponse,
        { status: 400 },
      );
    }

    if (
      !relationshipManager ||
      typeof relationshipManager !== "string" ||
      !relationshipManager.trim()
    ) {
      console.warn(
        "[Groups API] POST - Validation error: relationshipManager is required",
      );
      return NextResponse.json(
        {
          success: false,
          error: "Relationship Manager is required",
        } as ApiResponse,
        { status: 400 },
      );
    }

    if (!email || typeof email !== "string" || !email.trim()) {
      console.warn("[Groups API] POST - Validation error: email is required");
      return NextResponse.json(
        {
          success: false,
          error: "Email is required",
        } as ApiResponse,
        { status: 400 },
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      console.warn(
        "[Groups API] POST - Validation error: invalid email format",
      );
      return NextResponse.json(
        {
          success: false,
          error: "Invalid email format",
        } as ApiResponse,
        { status: 400 },
      );
    }

    console.log("[Groups API] POST - Creating group:", {
      name: name.trim(),
      relationshipManager: relationshipManager.trim(),
      email: email.trim(),
      description: description?.trim() || null,
      createdBy: user.userId,
    });

    // Create group in database
    const newGroup = await prisma.group.create({
      data: {
        name: name.trim(),
        relationshipManager: relationshipManager.trim(),
        email: email.trim(),
        description: description?.trim() || null,
        isActive: true,
        createdBy: user.userId,
      },
      include: {
        _count: {
          select: {
            subaccounts: true,
          },
        },
      },
    });

    console.log("[Groups API] POST - Group created successfully:", newGroup.id);

    await prisma.auditLog.create({
      data: {
        action: AuditAction.GROUP_CREATED,
        entityType: "Group",
        entityId: newGroup.id,
        userId: user.userId,
        description: `Group ${newGroup.name} created`,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: newGroup,
        message: "Group created successfully",
      } as ApiResponse,
      { status: 201 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Groups API] POST - Error:", errorMsg);

    // Check for duplicate group name
    if (errorMsg.includes("Unique constraint failed")) {
      return NextResponse.json(
        {
          success: false,
          error: "A group with this name already exists",
        } as ApiResponse,
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      } as ApiResponse,
      { status: 500 },
    );
  }
}
