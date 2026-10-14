/**
 * POST /api/auth/2fa/enroll/verify   { token: "<6-digit code>" }
 *
 * Forced 2FA setup at login (M-1), step 2: confirms the first authenticator
 * code, enables 2FA, returns backup codes (shown once) and completes the
 * login that /api/login held back - session cookies are set here.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateTokens, verifyEnrollmentToken } from "@/lib/jwt";
import {
  ENROLLMENT_COOKIE,
  clearEnrollmentCookie,
  redirectPathForRole,
  setSessionCookies,
} from "@/lib/auth/sessionCookies";
import { completeTwoFactorSetup } from "@/lib/auth/twoFactorEnrollment";
import { notifySecurityChange } from "@/lib/auth/securityAlerts";
import { revokeLoginSessions } from "@/lib/auth/sessionRevocation";
import { findLoginById, recordLogin } from "@/lib/auth/loginIdentity";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const enrollToken = request.cookies.get(ENROLLMENT_COOKIE)?.value;
    let decoded;
    try {
      if (!enrollToken) throw new Error("missing");
      decoded = await verifyEnrollmentToken(enrollToken);
    } catch {
      return NextResponse.json(
        { error: "Your setup session has expired. Please log in again." },
        { status: 401 },
      );
    }

    // Role from the database, not the token, in case it changed meanwhile.
    const login = await findLoginById(decoded.loginId);
    if (!login || login.userId !== decoded.userId) {
      return NextResponse.json(
        { error: "Your setup session has expired. Please log in again." },
        { status: 401 },
      );
    }
    const user = login.user;

    const { token } = await request.json();
    const result = await completeTwoFactorSetup(login.id, token);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    await prisma.userActivity.create({
      data: {
        userId: user.id,
        loginId: login.id,
        type: "2FA_ENABLED",
        ipAddress,
        userAgent,
      },
    });
    await recordLogin(login.id, user.id, "LOGIN", { ipAddress, userAgent });

    await notifySecurityChange(
      login.email,
      { type: "2FA_ENABLED" },
      request.headers,
    );

    // N-2: 2FA changed, so any older session of this login ends; the one
    // issued below is newer than the cutoff and stays valid.
    await revokeLoginSessions(login.id);

    // The code just entered is the second factor for this login.
    const { accessToken, refreshToken } = await generateTokens(
      { userId: user.id, loginId: login.id, role: user.role },
      { mfa: true },
    );

    const response = NextResponse.json({
      success: true,
      backupCodes: result.backupCodes,
      redirectUrl: redirectPathForRole(user.role),
    });
    setSessionCookies(response, accessToken, refreshToken);
    clearEnrollmentCookie(response);
    return response;
  } catch (error) {
    console.error("2FA enroll verify error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
