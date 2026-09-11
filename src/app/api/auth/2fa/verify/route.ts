import { NextRequest, NextResponse } from "next/server";
import speakeasy from "speakeasy";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";
import { getUserInfoFromToken } from "@/lib/helpers/getUserInfoFromToken";

export async function POST(req: NextRequest) {
  try {
    const jwt = req.cookies.get("token")?.value;
    if (!jwt) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = getUserInfoFromToken(jwt);

    if (!userId) {
      return NextResponse.json(
        { error: "Invalid token", userId },
        { status: 401 },
      );
    }

    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    // Get user's secret
    const twoFactorAuth = await prisma.twoFactorAuth.findUnique({
      where: { userId },
      select: { secret: true },
    });

    if (!twoFactorAuth?.secret) {
      return NextResponse.json(
        { error: "2FA has not been set up" },
        { status: 400 },
      );
    }

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: "base32",
      token: token,
      window: 1, // Allow 1 time step before/after for clock drift
    });

    if (!verified) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () =>
      Math.random().toString(36).substring(2, 8).toUpperCase(),
    );

    // Enable 2FA and save backup codes
    await prisma.twoFactorAuth.update({
      where: { userId },
      data: {
        enabled: true,
        backupCodes,
        enrolledAt: new Date(),
      },
    });

    // Log the 2FA enablement
    await prisma.userActivity.create({
      data: {
        userId,
        type: "2FA_ENABLED",
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
      },
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.TWO_FACTOR_ENABLED,
        entityType: "User",
        entityId: userId,
        userId,
        description: "Two-factor authentication enabled",
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json({
      success: true,
      backupCodes,
    });
  } catch (error) {
    console.error("2FA verification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
