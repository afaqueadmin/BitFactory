import { NextRequest, NextResponse, after } from "next/server";
import { hash } from "bcrypt";
import speakeasy from "speakeasy";
import { prisma } from "@/lib/prisma";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { sendPasswordChangedNotificationEmail } from "@/lib/email";
import { resolveResetLink } from "@/lib/auth/passwordReset";
import { sessionCutoffNow } from "@/lib/auth/sessionRevocation";
import { consumeBackupCode } from "@/lib/auth/backupCodes";
import { notifySecurityChangeForUser } from "@/lib/auth/securityAlerts";
import {
  clearAuthRateLimitForEmail,
  clearTwoFactorLoginAttempts,
  clearUserFactorAttempts,
  getClientIp,
  recordTwoFactorLoginAttempt,
  recordUserFactorAttempt,
} from "@/lib/rateLimit";

const INVALID_LINK =
  "This reset link is invalid, has expired or was already used. Please request a new one.";
const RESET_2FA_SCOPE = "password_reset_2fa";
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

class LinkAlreadyUsedError extends Error {}

/**
 * C-1: completes a forgotten-password reset from the emailed link. The link
 * proves access to the inbox; an account with 2FA must also give a code from
 * its authenticator or a backup code, so the inbox alone isn't enough. On
 * success the password changes, the link is spent and every session ends.
 */
export async function POST(request: NextRequest) {
  try {
    const { token, newPassword, twoFactorCode } = await request.json();

    const target = await resolveResetLink(token);
    if (!target) {
      return NextResponse.json(
        { error: INVALID_LINK, code: "INVALID_LINK" },
        { status: 400 },
      );
    }

    if (
      typeof newPassword !== "string" ||
      newPassword.length < MIN_PASSWORD_LENGTH ||
      newPassword.length > MAX_PASSWORD_LENGTH
    ) {
      return NextResponse.json(
        {
          error: `Your new password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters long.`,
        },
        { status: 400 },
      );
    }

    let usedBackupCode = false;
    if (target.twoFactor) {
      if (typeof twoFactorCode !== "string" || !twoFactorCode.trim()) {
        return NextResponse.json(
          {
            error:
              "Enter a code from your authenticator app or one of your backup codes.",
            code: "TWO_FACTOR_REQUIRED",
          },
          { status: 400 },
        );
      }

      // Same guessing limits as a 2FA login: 5 per 15 minutes here (fails
      // closed), and the login's 30-per-day lock (N-13) is shared, so the
      // reset page doesn't add a second budget for guessing codes.
      const attempt = await recordUserFactorAttempt(
        RESET_2FA_SCOPE,
        target.userId,
      );
      if (!attempt.allowed) {
        return NextResponse.json(
          { error: attempt.error },
          { status: attempt.status },
        );
      }
      const daily = await recordTwoFactorLoginAttempt(target.userId);
      if (!daily.allowed) {
        if (daily.justLocked) {
          await notifySecurityChangeForUser(
            target.userId,
            { type: "2FA_LOCKED" },
            request.headers,
          );
        }
        const hours = Math.max(1, Math.ceil(daily.retryAfterSeconds / 3600));
        return NextResponse.json(
          {
            error: `Too many incorrect codes. Two-factor verification for this account is locked for up to ${hours} hour${
              hours === 1 ? "" : "s"
            }.`,
          },
          {
            status: 429,
            headers: { "Retry-After": String(daily.retryAfterSeconds) },
          },
        );
      }

      const code = twoFactorCode.trim();
      const totpVerified =
        !!target.twoFactor.secret &&
        speakeasy.totp.verify({
          secret: target.twoFactor.secret,
          encoding: "base32",
          token: code,
          window: 1,
        });
      usedBackupCode =
        !totpVerified &&
        (await consumeBackupCode(
          target.userId,
          target.twoFactor.backupCodes,
          code,
        ));
      if (!totpVerified && !usedBackupCode) {
        return NextResponse.json(
          {
            error: "That code isn't correct. Please try again.",
            code: "INVALID_2FA",
          },
          { status: 400 },
        );
      }
      await clearUserFactorAttempts(RESET_2FA_SCOPE, target.userId);
      await clearTwoFactorLoginAttempts(target.userId);
    }

    const hashedPassword = await hash(newPassword, 12);

    // Spend the link and change the password together. The unique token
    // column stops a second use of this link; the password-hash condition
    // stops an older link racing a newer one.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.tokenBlacklist.create({
          data: {
            token: target.token,
            userId: target.userId,
            expiresAt: target.expiresAt,
          },
        });
        const updated = await tx.user.updateMany({
          where: {
            id: target.userId,
            isDeleted: false,
            password: target.passwordHash,
          },
          // N-2: a reset ends every existing session.
          data: {
            password: hashedPassword,
            sessionsValidAfter: sessionCutoffNow(),
          },
        });
        if (updated.count !== 1) throw new LinkAlreadyUsedError();
      });
    } catch (error) {
      if (
        error instanceof LinkAlreadyUsedError ||
        (error instanceof PrismaClientKnownRequestError &&
          error.code === "P2002")
      ) {
        return NextResponse.json(
          { error: INVALID_LINK, code: "INVALID_LINK" },
          { status: 400 },
        );
      }
      throw error;
    }

    const ipAddress = getClientIp(request.headers) ?? "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    await prisma.userActivity.create({
      data: {
        userId: target.userId,
        type: usedBackupCode ? "PASSWORD_RESET_BACKUP_CODE" : "PASSWORD_RESET",
        ipAddress,
        userAgent,
      },
    });

    // The owner may have been locked out of login by someone guessing.
    await clearAuthRateLimitForEmail("login", target.email);

    after(async () => {
      const result = await sendPasswordChangedNotificationEmail(target.email, {
        ipAddress,
        userAgent,
        changedAt: new Date(),
      });
      if (!result.success) {
        console.error(
          `[Reset Password API] Changed-password notice failed for user ${target.userId}`,
        );
      }
    });

    return NextResponse.json({ success: true, redirectUrl: "/login" });
  } catch (error) {
    console.error("[Reset Password API] Error:", error);
    return NextResponse.json(
      { error: "Couldn't reset your password. Please try again." },
      { status: 500 },
    );
  }
}
