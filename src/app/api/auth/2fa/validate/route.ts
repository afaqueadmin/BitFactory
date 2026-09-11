import { NextRequest, NextResponse } from "next/server";
import speakeasy from "speakeasy";
import { prisma } from "@/lib/prisma";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { generateTokens } from "@/lib/jwt";

export async function POST(req: NextRequest) {
  try {
    // Get request body
    const { email, token } = await req.json();
    // For login validation
    if (!email || !token) {
      return NextResponse.json(
        { error: "Email and token are required" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        twoFactorAuth: {
          select: { secret: true, enabled: true, backupCodes: true },
        },
      },
    });

    if (!user?.twoFactorAuth?.enabled) {
      return NextResponse.json(
        { error: "2FA is not enabled for this user" },
        { status: 400 },
      );
    }

    const twoFactorAuth = user.twoFactorAuth;

    // Generate tokens with role
    const { accessToken, refreshToken } = await generateTokens(
      user.id,
      user.role,
    );

    // Determine redirect URL based on role
    let redirectUrl: string;
    switch (user.role) {
      case "ADMIN":
      case "SUPER_ADMIN":
        redirectUrl = "/adminpanel";
        break;
      case "FRANCHISEE":
        redirectUrl = "/franchise/dashboard";
        break;
      default:
        redirectUrl = "/dashboard";
    }

    // Create response WITHOUT cookies yet
    const response = NextResponse.json({ success: true, redirectUrl });

    // First check if it's a backup code
    if (twoFactorAuth.backupCodes?.includes(token)) {
      // Remove the used backup code
      await prisma.twoFactorAuth.update({
        where: { userId: user.id },
        data: {
          backupCodes: {
            set: twoFactorAuth.backupCodes.filter((code) => code !== token),
          },
          lastUsedAt: new Date(),
        },
      });

      // Log the backup code usage
      await prisma.userActivity.create({
        data: {
          userId: user.id,
          type: "2FA_BACKUP_CODE_USED",
          ipAddress: req.headers.get("x-forwarded-for") || "unknown",
          userAgent: req.headers.get("user-agent") || "unknown",
        },
      });

      // Backup code verified successfully, now set cookies
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
    }

    // Verify TOTP
    const verified =
      !!twoFactorAuth.secret &&
      speakeasy.totp.verify({
        secret: twoFactorAuth.secret,
        encoding: "base32",
        token: token,
        window: 1,
      });

    if (!verified) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    await prisma.twoFactorAuth.update({
      where: { userId: user.id },
      data: { lastUsedAt: new Date() },
    });

    // Log successful 2FA verification
    await prisma.userActivity.create({
      data: {
        userId: user.id,
        type: "2FA_VERIFICATION_SUCCESS",
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
      },
    });

    // TOTP verified successfully, now set cookies
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
    console.error("2FA validation error:", error);

    if (error instanceof PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: "Database error occurred" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
