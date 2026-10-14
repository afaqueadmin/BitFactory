import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode } from "@/lib/auth/totpSecret";
import { getUserInfoFromToken } from "@/lib/helpers/getUserInfoFromToken";
import { twoFactorRequirement } from "@/lib/auth/twoFactorPolicy";
import { notifySecurityChangeForLogin } from "@/lib/auth/securityAlerts";
import { signOutOtherDevices } from "@/lib/auth/sessionRevocation";
import {
  clearUserFactorAttempts,
  recordUserFactorAttempt,
} from "@/lib/rateLimit";

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

    // M-1: once 2FA is mandatory, it can't be switched off (setting it up
    // again replaces the authenticator instead).
    const account = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (account && twoFactorRequirement(account.role, false) === "enforced") {
      return NextResponse.json(
        {
          error:
            "Two-factor authentication is required for your account and can't be turned off.",
        },
        { status: 403 },
      );
    }

    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const twoFactorAuth = await prisma.twoFactorAuth.findUnique({
      where: { loginId },
      select: { secret: true },
    });

    if (!twoFactorAuth?.secret) {
      return NextResponse.json(
        { error: "Two-factor authentication is not enabled" },
        { status: 400 },
      );
    }

    // N-1: a stolen session mustn't be able to guess its way to turning 2FA off.
    const attempt = await recordUserFactorAttempt("2fa_disable", loginId);
    if (!attempt.allowed) {
      return NextResponse.json(
        { error: attempt.error },
        { status: attempt.status },
      );
    }

    if (!verifyTotpCode(twoFactorAuth.secret, token)) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 },
      );
    }
    await clearUserFactorAttempts("2fa_disable", loginId);

    // Disable 2FA by clearing the secret and backup codes - the row itself
    // is kept (not deleted), so enrolledAt/lastUsedAt history survives a
    // disable/re-enable cycle.
    await prisma.twoFactorAuth.update({
      where: { loginId },
      data: {
        secret: null,
        pendingSecret: null,
        enabled: false,
        backupCodes: [],
      },
    });

    await prisma.userActivity.create({
      data: {
        userId,
        loginId,
        type: "2FA_DISABLED",
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
      },
    });

    await notifySecurityChangeForLogin(
      loginId,
      { type: "2FA_DISABLED" },
      req.headers,
    );

    // N-2: other devices are signed out; this one gets fresh tokens.
    const response = NextResponse.json({ success: true });
    await signOutOtherDevices(req, response, loginId);
    return response;
  } catch (error) {
    console.error("Error disabling 2FA:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
