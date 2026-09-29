import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserInfoFromToken } from "@/lib/helpers/getUserInfoFromToken";
import { completeTwoFactorSetup } from "@/lib/auth/twoFactorEnrollment";
import { notifySecurityChangeForUser } from "@/lib/auth/securityAlerts";

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

    const result = await completeTwoFactorSetup(userId, token);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    // Backup codes: returned to the user once below, stored only as hashes.
    const { backupCodes } = result;

    // Log the 2FA enablement
    await prisma.userActivity.create({
      data: {
        userId,
        type: "2FA_ENABLED",
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
      },
    });

    await notifySecurityChangeForUser(
      userId,
      { type: "2FA_ENABLED" },
      req.headers,
    );

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
