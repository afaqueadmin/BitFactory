import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import speakeasy from "speakeasy";
import { getUserInfoFromToken } from "@/lib/helpers/getUserInfoFromToken";

export async function POST(req: NextRequest) {
  try {
    const jwt = req.cookies.get("token")?.value;
    if (!jwt) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await getUserInfoFromToken(jwt);

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

    const twoFactorAuth = await prisma.twoFactorAuth.findUnique({
      where: { userId },
      select: { secret: true },
    });

    if (!twoFactorAuth?.secret) {
      return NextResponse.json(
        { error: "Two-factor authentication is not enabled" },
        { status: 400 },
      );
    }

    const isValid = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: "base32",
      token,
      window: 1, // Allow 1 time step before/after for clock drift
    });

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 },
      );
    }

    // Disable 2FA by clearing the secret and backup codes - the row itself
    // is kept (not deleted), so enrolledAt/lastUsedAt history survives a
    // disable/re-enable cycle.
    await prisma.twoFactorAuth.update({
      where: { userId },
      data: {
        secret: null,
        enabled: false,
        backupCodes: [],
      },
    });

    await prisma.userActivity.create({
      data: {
        userId,
        type: "2FA_DISABLED",
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error disabling 2FA:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
