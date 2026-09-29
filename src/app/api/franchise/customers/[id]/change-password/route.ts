/**
 * PUT /api/franchise/customers/[id]/change-password
 *
 * Lets a franchisee reset the password of one of their own customers.
 * FRANCHISEE role only, ownership-checked. The franchisee must re-verify
 * (password, or 2FA code if enabled) and the customer is always emailed.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcrypt";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@prisma/client";
import { assertFranchiseeOwnsCustomer } from "@/lib/franchiseeScope";
import { sendPasswordResetEmail } from "@/lib/email";
import { verifyStepUp } from "@/lib/auth/stepUp";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    if (decoded.role !== "FRANCHISEE") {
      return NextResponse.json(
        { success: false, error: "Franchisee access required" },
        { status: 403 },
      );
    }

    const owns = await assertFranchiseeOwnsCustomer(decoded.userId, id);
    if (!owns) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 },
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
        {
          success: false,
          error: "Password must be at least 8 characters",
        },
        { status: 400 },
      );
    }

    const stepUp = await verifyStepUp(
      decoded.userId,
      { currentPassword, twoFactorToken },
      "reset a customer's password",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    const customer = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { email: true },
    });

    // The customer is always told - a franchisee can't silently take over a
    // customer's account. Sending is a precondition for the change being
    // persisted, same as the self-service change-password route.
    const emailResult = await sendPasswordResetEmail(
      customer.email,
      newPassword,
    );
    if (!emailResult.success) {
      console.error(
        "[Franchise Customers API] Failed to send password reset email:",
        emailResult.error,
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "Could not email the customer, so the password was not changed. Please try again.",
        },
        { status: 502 },
      );
    }

    const hashedPassword = await hash(newPassword, 12);
    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    // Audit trail - a single row records both who did this and to whom.
    const franchisee = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { email: true },
    });
    await prisma.auditLog.create({
      data: {
        action: AuditAction.USER_PASSWORD_RESET,
        entityType: "User",
        entityId: id,
        userId: decoded.userId,
        description: `Password reset for ${customer.email} by franchisee ${franchisee?.email || decoded.userId}`,
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("[Franchise Customers API] change-password error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update password" },
      { status: 500 },
    );
  }
}
