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

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true },
    });

    if (!user?.twoFactorSecret) {
      return NextResponse.json(
        { error: "Two-factor authentication is not enabled" },
        { status: 400 },
      );
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
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

    // Disable 2FA by removing the secret and backup codes
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorBackupCodes: [],
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
