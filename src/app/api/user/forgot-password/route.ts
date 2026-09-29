import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcrypt";
import { sendPasswordResetEmail } from "@/lib/email";
import { canonicalEmail } from "@/lib/auth/emailIdentity";
import { checkAuthRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    // Validate input
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Observe-only for now - see H-1 in the plan. This route currently
    // overwrites the password on every call (C-1), so it's the highest
    // priority one to watch before enforcing.
    try {
      const rl = await checkAuthRateLimit("forgot_password", {
        email,
        ip: getClientIp(request.headers),
      });
      if (rl.blocked) {
        console.warn("[rateLimit:observe] forgot-password would be blocked", {
          email,
          emailRemaining: rl.email?.remaining,
          ipRemaining: rl.ip?.remaining,
        });
      }
    } catch (rlError) {
      console.error(
        "[rateLimit:observe] forgot-password check failed:",
        rlError,
      );
    }

    console.log(
      `[Password Reset API] Password reset requested for email: ${email}`,
    );

    // Same account rule as login (M-4): exact match on the canonical email.
    // Soft-deleted accounts can't log in, so they don't get resets either.
    const user = await prisma.user.findFirst({
      where: { email: canonicalEmail(email), isDeleted: false },
      select: { id: true, email: true },
    });

    if (!user) {
      // For security, don't reveal if email exists or not
      console.warn(`[Password Reset API] User not found for email: ${email}`);
      return NextResponse.json(
        {
          success: true,
          message:
            "If an account exists with this email, a password reset link has been sent",
        },
        { status: 200 },
      );
    }

    // Generate a random temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await hash(tempPassword, 12);

    // Update user password
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    console.log(`[Password Reset API] Password reset for user: ${user.id}`);

    // Send password reset email
    const emailResult = await sendPasswordResetEmail(user.email, tempPassword);

    if (!emailResult.success) {
      console.error(
        "[Password Reset API] Failed to send password reset email:",
        emailResult.error,
      );
      return NextResponse.json(
        { error: "Failed to send password reset email" },
        { status: 500 },
      );
    }

    console.log(`[Password Reset API] Password reset email sent to: ${email}`);

    return NextResponse.json(
      {
        success: true,
        message: "Password reset email sent successfully",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Password Reset API] Error:", error);
    return NextResponse.json(
      { error: "Failed to process password reset request" },
      { status: 500 },
    );
  }
}
