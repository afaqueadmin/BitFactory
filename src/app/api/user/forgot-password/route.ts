import { NextRequest, NextResponse, after } from "next/server";
import { signPasswordResetToken } from "@/lib/jwt";
import { sendPasswordResetLinkEmail } from "@/lib/email";
import { findLoginByEmail } from "@/lib/auth/loginIdentity";
import {
  RESET_LINK_MINUTES,
  passwordFingerprint,
  resetLinkUrl,
} from "@/lib/auth/passwordReset";
import { enforceAuthRateLimit, getClientIp } from "@/lib/rateLimit";

// H-1: caps how many reset emails anyone can make one account (or one IP)
// receive. Nothing clears these counters.
const FORGOT_PASSWORD_LIMITS = {
  perEmail: { max: 3, windowSeconds: 60 * 60 },
  perIp: { max: 10, windowSeconds: 60 * 60 },
};

// The same reply whether or not the account exists (and whatever happens to
// the email afterwards), so this can't be used to find registered emails.
const GENERIC_REPLY = {
  success: true,
  message:
    "If an account exists with this email, a password reset link has been sent. It expires in 30 minutes.",
};

/**
 * C-1: emails a single-use reset link (see src/lib/auth/passwordReset.ts).
 * Nothing about the account changes here - the password stays as it is until
 * the link is used, so a stranger who knows the email can't lock anyone out.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const ipAddress = getClientIp(request.headers);
    const limited = await enforceAuthRateLimit(
      "forgot_password",
      { email, ip: ipAddress },
      FORGOT_PASSWORD_LIMITS,
    );
    if (limited) return limited;

    // Same login rule as sign-in (M-4): exact match on the canonical email.
    // Soft-deleted accounts can't log in, so they don't get resets either.
    // Resets only this email's login - another login on the same account
    // keeps its own password.
    const user = await findLoginByEmail(email);

    if (user) {
      const token = await signPasswordResetToken(
        { userId: user.userId, loginId: user.id, role: user.user.role },
        passwordFingerprint(user.password),
      );
      // Sent after the reply, so a known email doesn't answer slower than an
      // unknown one.
      after(async () => {
        const result = await sendPasswordResetLinkEmail(user.email, {
          resetUrl: resetLinkUrl(token),
          validMinutes: RESET_LINK_MINUTES,
          ipAddress: ipAddress ?? "unknown",
        });
        if (!result.success) {
          console.error(
            `[Password Reset API] Reset link email failed for user ${user.id}`,
          );
        }
      });
    }

    return NextResponse.json(GENERIC_REPLY, { status: 200 });
  } catch (error) {
    console.error("[Password Reset API] Error:", error);
    return NextResponse.json(
      { error: "Failed to process password reset request" },
      { status: 500 },
    );
  }
}
