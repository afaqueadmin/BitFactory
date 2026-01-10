import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

// Route segment config
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Segment configuration to ensure this is treated as an API route
export const fetchCache = "force-no-store";
export const preferredRegion = "auto";

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
      if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Only administrators can search by customerId" },
          { status: 403 },
        );
      }
      userId = customerId;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
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
        twoFactorEnabled: true,
        isDeleted: true,
      },
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

    console.log("Profile API [GET]: Successfully fetched data");

    return Response.json(
      {
        user,
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

    // Validate required fields
    if (!data.email?.trim()) {
      return Response.json(
        { error: "Email is required" },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    // Check if email is being changed and if it's already taken
    if (data.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: data.email,
          NOT: { id: userId },
        },
      });

      if (existingUser) {
        return Response.json(
          { error: "Email already in use" },
          {
            status: 400,
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
        email: data.email,
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

    return Response.json(
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
