import { NextRequest, NextResponse } from "next/server";
import { resolveResetLink } from "@/lib/auth/passwordReset";

/**
 * C-1: lets /reset-password say up front whether its link still works and
 * whether a 2FA code will be needed. Changes nothing; the link is only spent
 * by POST /api/user/reset-password.
 */
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    const target = await resolveResetLink(token);
    if (!target) {
      return NextResponse.json({ valid: false });
    }
    return NextResponse.json({
      valid: true,
      email: target.email,
      requiresTwoFactor: target.twoFactor !== null,
    });
  } catch (error) {
    console.error("[Reset Password Check API] Error:", error);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
