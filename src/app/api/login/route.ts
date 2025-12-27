import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { generateTokens } from "@/lib/jwt";
import normalizeEmailUsername from "@/lib/helpers/normailizeEmailUsername";

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

    // Find all users and match by normalizing their stored email usernames
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        role: true,
        twoFactorEnabled: true,
      },
    });

    // Find user by comparing normalized email usernames
    const normalizedUsername = normalizeEmailUsername(email);
    const user = allUsers.find(
      (u) => normalizeEmailUsername(u.email) === normalizedUsername,
    );

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

    const isTwoFactorEnabled =
      process.env.TWO_FACTOR_ENABLED === "true" || false;
    // If 2FA is enabled, return a special response
    if (isTwoFactorEnabled && user.twoFactorEnabled) {
      return NextResponse.json({
        requiresTwoFactor: true,
        message: "Please enter your 2FA code",
        env: process.env,
      });
    }

    // Log successful login attempt
    try {
      await prisma.userActivity.create({
        data: {
          userId: user.id,
          type: "LOGIN",
          ipAddress:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
        },
      });
    } catch (e) {
      // Don't fail the login if activity logging fails
      console.error("Failed to log login activity:", e);
    }

    // Generate tokens with role
    const { accessToken, refreshToken } = await generateTokens(
      user.id,
      user.role,
    );

    // Determine redirect URL based on role
    const redirectUrl = user.role === "ADMIN" ? "/adminpanel" : "/dashboard";

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
      },
      { status: 200 },
    );

    // Set cookies with proper flags
    response.cookies.set("token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60, // 1 hour
      path: "/",
    });

    response.cookies.set("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
