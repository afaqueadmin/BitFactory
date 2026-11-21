import { staffActorLabel } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { sessionCutoffNow } from "@/lib/auth/sessionRevocation";
import { hash } from "bcrypt";
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
    const auth = await authorizeStaff(request, ["customers.reset_password"]);
    if ("response" in auth) return auth.response;
    const userId = auth.userId;
    const loginId = auth.decoded.loginId;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { role: true, email: true },
    });

    // A deleted account can't sign in, and must not be revived by a reset.
    const targetUser = await prisma.user.findFirst({
      where: { id, isDeleted: false },
      select: { role: true, email: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // An ADMIN or ACCOUNTING user cannot reset any staff password (ADMIN,
    // ACCOUNTING or SUPER_ADMIN). A SUPER_ADMIN can reset an ADMIN's or
    // ACCOUNTING user's password, but not another SUPER_ADMIN's. Only
    // CLIENT/FRANCHISEE/SIMULATED targets are open to all staff.
    if (!canManageAccount(user.role, targetUser.role)) {
      return NextResponse.json(
        { error: "You do not have permission to reset this user's password" },
        { status: 403 },
      );
    }

    const {
      newPassword,
      currentPassword,
      twoFactorToken,
      loginId: targetLoginIdInput,
    } = await request.json();

    // Which of the target's logins to reset: the one named, else the primary.
    const targetLogin = await prisma.userLogin.findFirst({
      where:
        typeof targetLoginIdInput === "string" && targetLoginIdInput
          ? { id: targetLoginIdInput, userId: id }
          : { userId: id, isPrimary: true },
      select: { id: true, email: true },
    });
    if (!targetLogin) {
      return NextResponse.json({ error: "Login not found" }, { status: 404 });
    }

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
      { loginId },
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
      targetLogin.email,
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

    const hashedPassword = await hash(newPassword, 12);
    await prisma.userLogin.update({
      where: { id: targetLogin.id },
      // N-2: the user didn't make this change - sign that login out
      // everywhere (the account's other login is unaffected).
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
        description: `Password reset for ${targetLogin.email} by ${staffActorLabel(
          user.role,
        )} ${user.email}`,
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
