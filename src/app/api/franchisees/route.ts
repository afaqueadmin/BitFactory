/**
 * src/app/api/franchisees/route.ts
 * Franchisee Management API Routes (GET, POST)
 *
 * Endpoints:
 * - GET /api/franchisees - List all franchises with their franchisee (owner) info
 * - POST /api/franchisees - Create a new franchisee user + linked franchise record
 *
 * Authorization: Admin/Super Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { hash } from "bcrypt";
import { sendWelcomeEmail } from "@/lib/email";
import normalizeEmailUsername from "@/lib/helpers/normailizeEmailUsername";

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
      console.warn("[Franchisees API] No token in cookies");
      return null;
    }
    return await verifyJwtToken(token);
  } catch (error) {
    console.error("[Franchisees API] Token verification error:", error);
    return null;
  }
}

/**
 * Generate a unique franchise code from the business name, e.g. "ACME-4F2B"
 */
async function generateFranchiseCode(businessName: string): Promise<string> {
  const prefix =
    businessName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6) || "FRAN";

  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Math.random().toString(36).slice(-4).toUpperCase();
    const code = `${prefix}-${suffix}`;
    const existing = await prisma.franchise.findUnique({
      where: { franchiseCode: code },
    });
    if (!existing) {
      return code;
    }
  }

  throw new Error("Failed to generate a unique franchise code");
}

/**
 * GET /api/franchisees
 * List all franchises with franchisee (owner) and creator info
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
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

    const franchises = await prisma.franchise.findMany({
      where: { deletedAt: null },
      include: {
        franchisee: {
          select: { id: true, name: true, email: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { users: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      { success: true, data: franchises } as unknown as ApiResponse,
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Franchisees API] GET - Error:", errorMsg);
    return NextResponse.json(
      { success: false, error: errorMsg } as ApiResponse,
      { status: 500 },
    );
  }
}

/**
 * POST /api/franchisees
 * Create a new FRANCHISEE-role user plus its linked Franchise record
 *
 * Request body:
 * {
 *   name: string (required)          - franchisee login/contact name
 *   email: string (required)         - franchisee login email
 *   sendEmail?: boolean               - send welcome email with credentials
 *   businessName: string (required)
 *   authorizedPersonName: string (required)
 *   phoneNumber: string (required)
 *   address: string (required)
 *   city: string (required)
 *   state: string (required)
 *   postalCode: string (required)
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authUser = await getAuthenticatedUser(request);

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse,
        { status: 401 },
      );
    }

    if (authUser.role !== "ADMIN" && authUser.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Admin/Super Admin can create franchisees",
        } as ApiResponse,
        { status: 403 },
      );
    }

    const body = await request.json();
    const {
      name,
      email,
      sendEmail,
      businessName,
      authorizedPersonName,
      phoneNumber,
      address,
      city,
      state,
      postalCode,
    } = body;

    const requiredFields: Record<string, unknown> = {
      name,
      email,
      businessName,
      authorizedPersonName,
      phoneNumber,
      address,
      city,
      state,
      postalCode,
    };

    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value || typeof value !== "string" || !value.trim()) {
        return NextResponse.json(
          {
            success: false,
            error: `${field} is required`,
          } as ApiResponse,
          { status: 400 },
        );
      }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { success: false, error: "Invalid email format" } as ApiResponse,
        { status: 400 },
      );
    }

    // Check email uniqueness the same way /api/user/create does
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true },
    });
    const normalizedUsername = normalizeEmailUsername(email);
    const existingUser = allUsers.find(
      (u) => normalizeEmailUsername(u.email) === normalizedUsername,
    );

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "Email is already in use" } as ApiResponse,
        { status: 400 },
      );
    }

    const franchiseCode = await generateFranchiseCode(businessName);

    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await hash(tempPassword, 12);

    const { franchisee, franchise } = await prisma.$transaction(async (tx) => {
      const franchisee = await tx.user.create({
        data: {
          name: name.trim(),
          email: email.trim(),
          password: hashedPassword,
          role: "FRANCHISEE",
        },
      });

      const franchise = await tx.franchise.create({
        data: {
          businessName: businessName.trim(),
          authorizedPersonName: authorizedPersonName.trim(),
          email: email.trim(),
          phoneNumber: phoneNumber.trim(),
          address: address.trim(),
          city: city.trim(),
          state: state.trim(),
          postalCode: postalCode.trim(),
          franchiseCode,
          createdById: authUser.userId,
          franchiseeId: franchisee.id,
        },
      });

      return { franchisee, franchise };
    });

    await prisma.userActivity.create({
      data: {
        userId: authUser.userId,
        type: "FRANCHISEE_CREATED",
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    let emailSent = false;
    if (sendEmail) {
      const emailResult = await sendWelcomeEmail(email, tempPassword);
      if (!emailResult.success) {
        console.error(
          "[Franchisees API] Failed to send welcome email:",
          emailResult.error,
        );
      } else {
        emailSent = true;
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          franchise,
          franchisee: {
            id: franchisee.id,
            name: franchisee.name,
            email: franchisee.email,
            role: franchisee.role,
          },
          tempPassword,
          emailSent,
        },
        message: "Franchisee created successfully",
      } as ApiResponse,
      { status: 201 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Franchisees API] POST - Error:", errorMsg);

    if (errorMsg.includes("Unique constraint failed")) {
      return NextResponse.json(
        {
          success: false,
          error: "A franchise with this code or email already exists",
        } as ApiResponse,
        { status: 409 },
      );
    }

    return NextResponse.json(
      { success: false, error: errorMsg } as ApiResponse,
      { status: 500 },
    );
  }
}
