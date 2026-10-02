import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { resolveLuxorSubaccounts } from "@/lib/luxorSubaccounts";
import { canonicalEmail } from "@/lib/auth/emailIdentity";
import { Prisma } from "@prisma/client";
import {
  twoFactorEnforceFrom,
  twoFactorRequirement,
} from "@/lib/auth/twoFactorPolicy";

// Everything the profile endpoints return. Explicit so the password hash and
// 2FA secrets/backup codes never reach the browser.
const PROFILE_SELECT = {
  id: true,
  email: true,
  name: true,
  phoneNumber: true,
  dateOfBirth: true,
  country: true,
  city: true,
  streetAddress: true,
  profileImage: true,
  profileImageId: true,
  companyName: true,
  idNumber: true,
  companyUrl: true,
  role: true,
  twoFactorAuth: { select: { enabled: true } },
  isDeleted: true,
} satisfies Prisma.UserSelect;

// Route segment config
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Segment configuration to ensure this is treated as an API route
export const fetchCache = "force-no-store";
export const preferredRegion = "iad1";

// GET: Fetch user profile
export async function GET(request: NextRequest) {
  console.log("Profile API [GET]: Starting handler");

  try {
    const token = request.cookies.get("token")?.value;
    console.log("Profile API [GET]: Token present:", !!token);

    if (!token) {
      return Response.json(
        { error: "Unauthorized" },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    let userId: string;
    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
      userRole = decoded.role;
      console.log("Profile API [GET]: Token verified, userId:", userId);
    } catch (error) {
      console.error("Profile API [GET]: Token verification failed:", error);
      return Response.json(
        { error: "Invalid token" },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    if (customerId) {
      if (userRole === "FRANCHISEE") {
        const owned = await prisma.user.findFirst({
          where: { id: customerId, franchisee: { franchiseeId: userId } },
          select: { id: true },
        });
        if (!owned) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      } else if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Only administrators can search by customerId" },
          { status: 403 },
        );
      }
      userId = customerId;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });

    if (!user) {
      console.error("Profile API [GET]: User not found for id:", userId);
      return Response.json(
        { error: "User not found" },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    // Fetch recent activities
    const recentActivities = await prisma.userActivity.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Every Luxor subaccount this user has, for the client-side subaccount
    // filter. Cheap enough to resolve unconditionally rather than special
    // casing by role.
    const luxorSubaccounts = await resolveLuxorSubaccounts(userId);

    console.log("Profile API [GET]: Successfully fetched data");

    // Keep the response shape flat (twoFactorEnabled as a top-level boolean)
    // for existing consumers, even though it now lives in its own table.
    const { twoFactorAuth, ...userFields } = user;
    const twoFactorEnabled = twoFactorAuth?.enabled ?? false;

    return Response.json(
      {
        user: {
          ...userFields,
          twoFactorEnabled,
          // M-1: when set, the account must enable 2FA by this date (shown
          // as a reminder in the app); null once it's enabled.
          twoFactorRequiredBy:
            twoFactorRequirement(userFields.role, twoFactorEnabled) ===
            "satisfied"
              ? null
              : twoFactorEnforceFrom().toISOString(),
        },
        subaccounts: luxorSubaccounts,
        recentActivities,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("Profile API [GET]: Error:", error);
    return Response.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  }
}

// PATCH: Update user profile
export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return Response.json(
        { error: "Unauthorized" },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      return Response.json(
        { error: "Invalid token" },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    const data = await request.json();

    // N-6: the email is where password resets go, and nothing here proves the
    // new address belongs to the user, so it can't be changed from your own
    // profile - only by a SUPER_ADMIN (PUT /api/user/[id]). The forms send the
    // current email back unchanged, which is fine.
    if (data.email !== undefined) {
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (
        typeof data.email !== "string" ||
        !current ||
        canonicalEmail(data.email) !== canonicalEmail(current.email)
      ) {
        return Response.json(
          {
            error:
              "Your email can't be changed here. Please contact support to change it.",
            code: "EMAIL_CHANGE_NOT_ALLOWED",
          },
          {
            status: 403,
            headers: {
              "Cache-Control": "no-store, no-cache, must-revalidate",
            },
          },
        );
      }
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        phoneNumber: data.phoneNumber,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        country: data.country,
        city: data.city,
        streetAddress: data.streetAddress,
        companyName: data.companyName,
        idNumber: data.idNumber,
        companyUrl: data.companyUrl,
        profileImage: data.profileImage,
        profileImageId: data.profileImageId,
      },
      select: PROFILE_SELECT,
    });

    // Log the profile update activity
    await prisma.userActivity.create({
      data: {
        userId,
        type: "PROFILE_UPDATE",
        ipAddress:
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip") ||
          "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json(
      { user: updatedUser },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("Profile API [PATCH]: Error:", error);
    return Response.json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  }
}
