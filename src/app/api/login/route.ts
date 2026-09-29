import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import {
  generateTokens,
  signEnrollmentToken,
  signPendingTwoFactorToken,
} from "@/lib/jwt";
import { twoFactorRequirement } from "@/lib/auth/twoFactorPolicy";
import {
  redirectPathForRole,
  setEnrollmentCookie,
  setPendingTwoFactorCookie,
  setSessionCookies,
} from "@/lib/auth/sessionCookies";
import {
  clearAuthRateLimitForEmail,
  enforceAuthRateLimit,
  getClientIp,
} from "@/lib/rateLimit";
import { canonicalEmail } from "@/lib/auth/emailIdentity";

// Add runtime config for Node.js runtime
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { email, password } = body;

    // Input validation
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Invalid input format" },
        { status: 400 },
      );
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    // H-1: per-email and per-IP attempt limits. Counted before the account
    // lookup, so the response is the same whether or not the email exists.
    const limited = await enforceAuthRateLimit("login", {
      email,
      ip: getClientIp(request.headers),
    });
    if (limited) return limited;

    // Match the exact account by canonical email (M-4) - case-insensitive,
    // dots significant. No dot-stripping: it can route login to the wrong
    // account when multiple emails normalize to the same value.
    const user = await prisma.user.findFirst({
      where: {
        isDeleted: false,
        email: canonicalEmail(email),
      },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        role: true,
        twoFactorAuth: { select: { enabled: true } },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Check password with timing attack protection
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(password, user.password);
    } catch (e) {
      console.error("Password comparison error:", e);
      return NextResponse.json(
        { error: "An error occurred during login" },
        { status: 500 },
      );
    }

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Correct password: only failed attempts should count toward a lockout.
    await clearAuthRateLimitForEmail("login", email);

    // Require 2FA only when this specific user has 2FA enabled. The pending
    // token proves the password step to /api/auth/2fa/validate (C-3).
    if (user.twoFactorAuth?.enabled) {
      const response = NextResponse.json({
        requiresTwoFactor: true,
        message: "Please enter your 2FA code",
      });
      setPendingTwoFactorCookie(
        response,
        await signPendingTwoFactorToken(user.id, user.role),
      );
      return response;
    }

    // M-1: past the grace period, no session until 2FA is set up. The
    // enrollment token only unlocks /api/auth/2fa/enroll/*.
    if (twoFactorRequirement(user.role, false) === "enforced") {
      const response = NextResponse.json({
        requiresTwoFactorSetup: true,
        message: "Two-factor authentication is required for your account",
      });
      setEnrollmentCookie(
        response,
        await signEnrollmentToken(user.id, user.role),
      );
      return response;
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Log successful login attempt
    try {
      await prisma.userActivity.create({
        data: {
          userId: user.id,
          type: "LOGIN",
          ipAddress,
          userAgent,
        },
      });
    } catch (e) {
      // Don't fail the login if activity logging fails
      console.error("Failed to log login activity:", e);
    }

    // Create a session record for tracking
    let sessionId: string | null = null;
    try {
      const session = await prisma.userSession.create({
        data: { userId: user.id, ipAddress, userAgent },
      });
      sessionId = session.id;
    } catch (e) {
      console.error("Failed to create user session:", e);
    }

    // Generate tokens with role
    const { accessToken, refreshToken } = await generateTokens(
      user.id,
      user.role,
    );

    const redirectUrl = redirectPathForRole(user.role);

    // Create response
    const response = NextResponse.json(
      {
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        redirectUrl,
        sessionId,
      },
      { status: 200 },
    );

    setSessionCookies(response, accessToken, refreshToken);
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
