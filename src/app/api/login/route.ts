import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcrypt";
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
import { findLoginByEmail, recordLogin } from "@/lib/auth/loginIdentity";

// Add runtime config for Node.js runtime
export const runtime = "nodejs";

// bcrypt hash (cost 12, like real passwords) of a random value nobody knows.
// Compared against when the email has no account (N-12).
const DUMMY_PASSWORD_HASH =
  "$2b$12$UOwU4ppKZQpp237QTb84t.uNrZ/GpJGr0Qpxbbxl46MpXYChuyJmq";

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

    // Match the exact login by canonical email (M-4) - case-insensitive,
    // dots significant. No dot-stripping: it can route login to the wrong
    // account when multiple emails normalize to the same value. An account
    // can have more than one login; the password and 2FA checked below are
    // this login's own.
    const login = await findLoginByEmail(email);

    if (!login) {
      // N-12: spend the same bcrypt time as a real password check, so the
      // response time doesn't reveal whether the email has an account.
      await compare(password, DUMMY_PASSWORD_HASH).catch(() => false);
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Check password with timing attack protection
    let isPasswordValid = false;
    try {
      isPasswordValid = await compare(password, login.password);
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

    const user = login.user;
    const subject = { userId: user.id, loginId: login.id, role: user.role };

    // Require 2FA only when this specific login has 2FA enabled. The pending
    // token proves the password step to /api/auth/2fa/validate (C-3).
    if (login.twoFactorAuth?.enabled) {
      const response = NextResponse.json({
        requiresTwoFactor: true,
        message: "Please enter your 2FA code",
      });
      setPendingTwoFactorCookie(
        response,
        await signPendingTwoFactorToken(subject),
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
      setEnrollmentCookie(response, await signEnrollmentToken(subject));
      return response;
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const sessionId = await recordLogin(login.id, user.id, "LOGIN", {
      ipAddress,
      userAgent,
    });

    // Generate tokens with role
    const { accessToken, refreshToken } = await generateTokens(subject);

    const redirectUrl = redirectPathForRole(user.role);

    // Create response
    const response = NextResponse.json(
      {
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          loginEmail: login.email,
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
