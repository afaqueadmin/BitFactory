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
      console.warn("[Groups API] No token in cookies");
      return null;
    }
    const user = await verifyJwtToken(token);
    return user;
  } catch (error) {
    console.error("[Groups API] Token verification error:", error);
    return null;
  }
}

/**
 * GET /api/groups
 * List all groups with subaccount counts
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    console.log("[Groups API] GET /api/groups - Fetching all groups");

    // Get authenticated user
    const user = await getAuthenticatedUser(request);

    if (!user) {
      console.warn("[Groups API] GET - Unauthorized: No user session");
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        } as ApiResponse,
        { status: 401 },
      );
    }

    // Check authorization (Admin or Super Admin)
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      console.warn("[Groups API] GET - Forbidden: User role is", user.role);
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Admin/Super Admin can manage groups",
        } as ApiResponse,
        { status: 403 },
      );
    }

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
 *   description?: string
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    console.log("[Groups API] POST /api/groups - Creating new group");

    // Get authenticated user
    const user = await getAuthenticatedUser(request);

    if (!user) {
      console.warn("[Groups API] POST - Unauthorized: No user session");
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        } as ApiResponse,
        { status: 401 },
      );
    }

    // Check authorization (Admin or Super Admin)
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      console.warn("[Groups API] POST - Forbidden: User role is", user.role);
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Admin/Super Admin can create groups",
        } as ApiResponse,
        { status: 403 },
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, description } = body;

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

    console.log("[Groups API] POST - Creating group:", {
      name: name.trim(),
      description: description?.trim() || null,
      createdBy: user.userId,
    });

    // Create group in database
    const newGroup = await prisma.group.create({
      data: {
        name: name.trim(),
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
