import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserInfoFromToken } from "@/lib/helpers/getUserInfoFromToken";
import { completeTwoFactorSetup } from "@/lib/auth/twoFactorEnrollment";
import { notifySecurityChangeForLogin } from "@/lib/auth/securityAlerts";
import { signOutOtherDevices } from "@/lib/auth/sessionRevocation";

export async function POST(req: NextRequest) {
  try {
    const jwt = req.cookies.get("token")?.value;
    if (!jwt) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, loginId } = await getUserInfoFromToken(jwt);

    if (!userId || !loginId) {
      return NextResponse.json(
        { error: "Invalid token", userId },
        { status: 401 },
      );
    }

    const { token } = await req.json();

    // The signed-in login's own authenticator - not the account's other login.
    const result = await completeTwoFactorSetup(loginId, token);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    // Backup codes: returned to the user once below, stored only as hashes.
    const { backupCodes } = result;

    // Log the 2FA enablement
    await prisma.userActivity.create({
      data: {
        userId,
        loginId,
        type: "2FA_ENABLED",
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
      },
    });

    await notifySecurityChangeForLogin(
      loginId,
      { type: "2FA_ENABLED" },
      req.headers,
    );

    // N-2: other devices are signed out; this one gets fresh tokens, marked
    // 2FA-verified since a code from the new authenticator was just entered.
    const response = NextResponse.json({
      success: true,
      backupCodes,
    });
    await signOutOtherDevices(req, response, loginId, { mfa: true });
    return response;
  } catch (error) {
    console.error("2FA verification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
