import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json(
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
    // Verify token and check if user is admin
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("Get users API [GET]: Token verification failed:", error);
      return NextResponse.json(
        { error: "Invalid token" },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    // Get user from database and check if admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can view all users" },
        { status: 403 },
      );
    }

    // Fetch all users (excluding passwords)
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        city: true,
        country: true,
        phoneNumber: true,
        companyName: true,
        twoFactorEnabled: true,
        createdAt: true,
        miners: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Transform the data to include miner count
    const transformedUsers = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name || "N/A",
      role: user.role,
      city: user.city || "N/A",
      country: user.country || "N/A",
      phoneNumber: user.phoneNumber || "N/A",
      companyName: user.companyName || "N/A",
      twoFactorEnabled: user.twoFactorEnabled,
      joinDate: user.createdAt.toISOString().split("T")[0],
      miners: user.miners.length,
      status: "active", // You can add logic to determine status
    }));

    return NextResponse.json(
      {
        success: true,
        users: transformedUsers,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("Get users API [GET]:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 },
    );
  }
}
