import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import bcrypt from "bcryptjs";
import { AuditAction } from "@prisma/client";
import { sendPasswordResetEmail } from "@/lib/email";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token
    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can change user passwords" },
        { status: 403 },
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { role: true, email: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // An ADMIN cannot reset another ADMIN's or a SUPER_ADMIN's password.
    // A SUPER_ADMIN can reset an ADMIN's password, but not another
    // SUPER_ADMIN's. Only CLIENT/FRANCHISEE targets are unrestricted.
    const targetIsAdminTier =
      targetUser.role === "ADMIN" || targetUser.role === "SUPER_ADMIN";
    const forbidden =
      (user.role === "ADMIN" && targetIsAdminTier) ||
      (user.role === "SUPER_ADMIN" && targetUser.role === "SUPER_ADMIN");

    if (forbidden) {
      return NextResponse.json(
        { error: "You do not have permission to reset this user's password" },
        { status: 403 },
      );
    }

    const { newPassword, emailPassword } = await request.json();

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long" },
        { status: 400 },
      );
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
      },
      select: {
        email: true,
      },
    });

    // Optionally email the new password to the client
    if (emailPassword && updatedUser.email) {
      // Reuse the existing password reset email template
      void sendPasswordResetEmail(updatedUser.email, newPassword);
    }

    // Audit trail - a single row records both who did this and to whom,
    // regardless of whether the target was also emailed.
    await prisma.auditLog.create({
      data: {
        action: AuditAction.USER_PASSWORD_RESET,
        entityType: "User",
        entityId: id,
        userId,
        description: `Password reset for ${updatedUser.email} by ${
          user.role === "SUPER_ADMIN" ? "super admin" : "admin"
        } ${user.email}`,
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json({
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Error changing password:", error);
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 },
    );
  }
}
