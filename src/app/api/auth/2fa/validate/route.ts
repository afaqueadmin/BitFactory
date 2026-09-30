import { NextRequest, NextResponse } from "next/server";
import speakeasy from "speakeasy";
import { prisma } from "@/lib/prisma";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { generateTokens, verifyPendingTwoFactorToken } from "@/lib/jwt";
import {
  PENDING_2FA_COOKIE,
  clearPendingTwoFactorCookie,
} from "@/lib/auth/sessionCookies";
import {
  clearAuthRateLimitForEmail,
  clearTwoFactorLoginAttempts,
  enforceAuthRateLimit,
  getClientIp,
  recordTwoFactorLoginAttempt,
} from "@/lib/rateLimit";
import { notifySecurityChangeForUser } from "@/lib/auth/securityAlerts";
import { canonicalEmail } from "@/lib/auth/emailIdentity";
import { consumeBackupCode } from "@/lib/auth/backupCodes";
import { isTokenBlacklisted } from "@/lib/auth/tokenBlacklist";

export async function POST(req: NextRequest) {
  try {
    // Get request body
    const { email, token } = await req.json();
    // For login validation
    if (!email || typeof email !== "string" || !token) {
      return NextResponse.json(
        { error: "Email and token are required" },
        { status: 400 },
      );
    }

    // H-1: this endpoint is what actually gates a 2FA login, so it caps
    // code/backup-code guessing per account and per IP.
    const limited = await enforceAuthRateLimit("2fa_validate", {
      email,
      ip: getClientIp(req.headers),
    });
    if (limited) return limited;

    // C-3: a 2FA/backup code only counts as the *second* factor. Require the
    // pending token /api/login set after a correct password, for this user.
    const pendingToken = req.cookies.get(PENDING_2FA_COOKIE)?.value;
    let pendingUserId: string | null = null;
    if (pendingToken && !(await isTokenBlacklisted(pendingToken))) {
      try {
        pendingUserId = (await verifyPendingTwoFactorToken(pendingToken))
          .userId;
      } catch {
        pendingUserId = null;
      }
    }
    if (!pendingUserId) {
      return NextResponse.json(
        { error: "Your sign-in has expired. Please log in again." },
        { status: 401 },
      );
    }

    // isDeleted: the account may have been deleted after the password step.
    const user = await prisma.user.findFirst({
      where: { email: canonicalEmail(email), isDeleted: false },
      select: {
        id: true,
        role: true,
        twoFactorAuth: {
          select: { secret: true, enabled: true, backupCodes: true },
        },
      },
    });

    // The password was verified for a different account than this email.
    if (!user || user.id !== pendingUserId) {
      return NextResponse.json(
        { error: "Your sign-in has expired. Please log in again." },
        { status: 401 },
      );
    }

    if (!user.twoFactorAuth?.enabled) {
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
      { mfa: true },
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

    // Create response WITHOUT cookies yet (only returned on success, which
    // also uses up the pending token).
    const response = NextResponse.json({ success: true, redirectUrl });
    clearPendingTwoFactorCookie(response);

    if (typeof token !== "string") {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    // N-13: 30 wrong codes in 24 hours locks this step for the account.
    const daily = await recordTwoFactorLoginAttempt(user.id);
    if (!daily.allowed) {
      if (daily.justLocked) {
        await notifySecurityChangeForUser(
          user.id,
          { type: "2FA_LOCKED" },
          req.headers,
        );
      }
      const hours = Math.max(1, Math.ceil(daily.retryAfterSeconds / 3600));
      return NextResponse.json(
        {
          error: `Too many incorrect codes. Two-factor sign-in for this account is locked for up to ${hours} hour${
            hours === 1 ? "" : "s"
          }. You can still sign in with a passkey.`,
          retryAfterSeconds: daily.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(daily.retryAfterSeconds) },
        },
      );
    }

    // Authenticator code first - it's cheap, while a backup-code check costs
    // up to one bcrypt compare per remaining code.
    const totpVerified =
      !!twoFactorAuth.secret &&
      speakeasy.totp.verify({
        secret: twoFactorAuth.secret,
        encoding: "base32",
        token: token,
        window: 1,
      });
    const usedBackupCode =
      !totpVerified &&
      (await consumeBackupCode(user.id, twoFactorAuth.backupCodes, token));

    if (!totpVerified && !usedBackupCode) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    // Spend the pending token: one password check buys one login. The unique
    // token column makes this atomic, so a replay or a parallel request with
    // the same token fails here.
    try {
      await prisma.tokenBlacklist.create({
        data: {
          token: pendingToken!,
          userId: user.id,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return NextResponse.json(
          { error: "Your sign-in has expired. Please log in again." },
          { status: 401 },
        );
      }
      throw error;
    }

    // consumeBackupCode already stamped lastUsedAt when it removed the code.
    if (totpVerified) {
      await prisma.twoFactorAuth.update({
        where: { userId: user.id },
        data: { lastUsedAt: new Date() },
      });
    }

    await prisma.userActivity.create({
      data: {
        userId: user.id,
        type: usedBackupCode
          ? "2FA_BACKUP_CODE_USED"
          : "2FA_VERIFICATION_SUCCESS",
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
      },
    });

    await clearAuthRateLimitForEmail("2fa_validate", email);
    await clearTwoFactorLoginAttempts(user.id);

    // Verified, now set cookies
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
