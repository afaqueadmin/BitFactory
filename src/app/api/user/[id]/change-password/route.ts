import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionCutoffNow } from "@/lib/auth/sessionRevocation";
import { verifyJwtToken } from "@/lib/jwt";
import bcrypt from "bcryptjs";
import { AuditAction } from "@prisma/client";
import { sendPasswordResetEmail } from "@/lib/email";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { canManageAccount } from "@/lib/auth/accountTiers";

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
    if (!canManageAccount(user.role, targetUser.role)) {
      return NextResponse.json(
        { error: "You do not have permission to reset this user's password" },
        { status: 403 },
      );
    }

    const { newPassword, currentPassword, twoFactorToken } =
      await request.json();

    if (
      !newPassword ||
      typeof newPassword !== "string" ||
      newPassword.length < 8
    ) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 },
      );
    }

    const stepUp = await verifyStepUp(
      userId,
      { currentPassword, twoFactorToken },
      "reset a user's password",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    // The target is always told. Sending is a precondition for the change
    // being persisted, same as the self-service change-password route.
    const emailResult = await sendPasswordResetEmail(
      targetUser.email,
      newPassword,
    );
    if (!emailResult.success) {
      return NextResponse.json(
        {
          error:
            "Could not email the user, so the password was not changed. Please try again.",
        },
        { status: 502 },
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id },
      // N-2: the user didn't make this change - sign them out everywhere.
      data: {
        password: hashedPassword,
        sessionsValidAfter: sessionCutoffNow(),
      },
    });

    // Audit trail - a single row records both who did this and to whom.
    await prisma.auditLog.create({
      data: {
        action: AuditAction.USER_PASSWORD_RESET,
        entityType: "User",
        entityId: id,
        userId,
        description: `Password reset for ${targetUser.email} by ${
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
