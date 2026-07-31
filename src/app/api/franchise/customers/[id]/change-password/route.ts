/**
 * PUT /api/franchise/customers/[id]/change-password
 *
 * Lets a franchisee reset the password of one of their own customers.
 * FRANCHISEE role only, ownership-checked.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcrypt";
import { verifyJwtToken } from "@/lib/jwt";
import { assertFranchiseeOwnsCustomer } from "@/lib/franchiseeScope";
import { sendPasswordResetEmail } from "@/lib/email";

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

    const { newPassword, emailPassword } = await request.json();

    if (
      !newPassword ||
      typeof newPassword !== "string" ||
      newPassword.length < 6
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Password must be at least 6 characters",
        },
        { status: 400 },
      );
    }

    const hashedPassword = await hash(newPassword, 12);
    const customer = await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
      select: { email: true },
    });

    if (emailPassword) {
      const emailResult = await sendPasswordResetEmail(
        customer.email,
        newPassword,
      );
      if (!emailResult.success) {
        console.error(
          "[Franchise Customers API] Failed to send password reset email:",
          emailResult.error,
        );
      }
    }

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
