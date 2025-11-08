import { prisma } from "@/lib/prisma";
import { hash, compare } from "bcrypt";
import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    console.log("Change Password API [GET]: Token present:", !!token);

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
      console.log("ChangePassword API [GET]: Token verified, userId:", userId);
    } catch (error) {
      console.error(
        "ChangePassword API [GET]: Token verification failed:",
        error,
      );
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

    const { currentPassword, newPassword } = await request.json();

    // Input validation
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters long" },
        { status: 400 },
      );
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify current password
    const passwordValid = await compare(currentPassword, user.password);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 },
      );
    }

    // Hash new password
    const hashedPassword = await hash(newPassword, 12);

    // Update password in database
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Log the password change activity
    await prisma.userActivity.create({
      data: {
        userId: userId,
        type: "PASSWORD_CHANGE",
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json(
      { message: "Password changed successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Password change error:", error);
    return NextResponse.json(
      { error: "An error occurred while changing your password" },
      { status: 500 },
    );
  }
}
