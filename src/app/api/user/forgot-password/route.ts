import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionCutoffNow } from "@/lib/auth/sessionRevocation";
import { hash } from "bcrypt";
import { sendPasswordResetEmail } from "@/lib/email";
import { canonicalEmail } from "@/lib/auth/emailIdentity";
import { enforceAuthRateLimit, getClientIp } from "@/lib/rateLimit";

const FORGOT_PASSWORD_LIMITS = {
  perEmail: { max: 3, windowSeconds: 60 * 60 },
  perIp: { max: 10, windowSeconds: 60 * 60 },
};

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    // Validate input
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // H-1: tighter than the login defaults because, until C-1 is fixed, every
    // call overwrites the account's password - so this caps how often anyone
    // can force a reset on someone else. Nothing clears these counters.
    const limited = await enforceAuthRateLimit(
      "forgot_password",
      { email, ip: getClientIp(request.headers) },
      FORGOT_PASSWORD_LIMITS,
    );
    if (limited) return limited;

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
      // N-2: a reset ends every existing session.
      data: {
        password: hashedPassword,
        sessionsValidAfter: sessionCutoffNow(),
      },
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
