import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcrypt";
import { sendPasswordResetEmail } from "@/lib/email";
import normalizeEmailUsername from "@/lib/helpers/normailizeEmailUsername";
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

    // Find all users and match by normalizing their stored email usernames
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true },
    });

    // Find user by comparing normalized email usernames
    const normalizedUsername = normalizeEmailUsername(email);
    const user = allUsers.find(
      (u) => normalizeEmailUsername(u.email) === normalizedUsername,
    );

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
    const emailResult = await sendPasswordResetEmail(email, tempPassword);

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
