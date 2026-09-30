import { compare } from "bcrypt";
import speakeasy from "speakeasy";
import { prisma } from "@/lib/prisma";
import { consumeBackupCode } from "@/lib/auth/backupCodes";
import {
  clearUserFactorAttempts,
  recordUserFactorAttempt,
} from "@/lib/rateLimit";

/**
 * Step-up re-authentication for sensitive actions where a live session cookie
 * alone shouldn't be enough. Which factor is required is decided from the
 * user's own record, never from what the caller sends, so 2FA can't be dodged
 * by supplying a password instead.
 *
 * Wrong passwords/codes are limited per user (N-1), with one budget shared by
 * every caller - otherwise a stolen session could keep guessing, or move to
 * another route for a fresh budget. A request with no credential (the
 * client asking which factor is needed) isn't counted.
 *
 * Node runtime only (Prisma + bcrypt).
 */

/** Rate-limit scope; also used by /api/user/change-password's own check. */
export const STEP_UP_SCOPE = "step_up";

export interface StepUpCredentials {
  currentPassword?: unknown;
  twoFactorToken?: unknown;
}

export type StepUpResult =
  | { ok: true; method: "2FA" | "PASSWORD" }
  | {
      ok: false;
      status: 400 | 404 | 429 | 503;
      error: string;
      code?: "TWO_FACTOR_REQUIRED" | "PASSWORD_REQUIRED";
    };

/**
 * `actionLabel` completes the sentence "... is required to <actionLabel>",
 * e.g. "add a passkey".
 */
export async function verifyStepUp(
  userId: string,
  credentials: StepUpCredentials,
  actionLabel: string,
): Promise<StepUpResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      password: true,
      twoFactorAuth: {
        select: { enabled: true, secret: true, backupCodes: true },
      },
    },
  });
  if (!user) {
    return { ok: false, status: 404, error: "User not found" };
  }

  const twoFactorAuth = user.twoFactorAuth;

  if (twoFactorAuth?.enabled) {
    const { twoFactorToken } = credentials;
    if (!twoFactorToken || typeof twoFactorToken !== "string") {
      return {
        ok: false,
        status: 400,
        error: `A 2FA code is required to ${actionLabel}`,
        code: "TWO_FACTOR_REQUIRED",
      };
    }

    const limited = await limitAttempt(userId);
    if (limited) return limited;

    // Authenticator code first (cheap); backup codes cost a bcrypt compare each.
    const verified =
      !!twoFactorAuth.secret &&
      speakeasy.totp.verify({
        secret: twoFactorAuth.secret,
        encoding: "base32",
        token: twoFactorToken,
        window: 1,
      });
    if (verified) {
      await prisma.twoFactorAuth.update({
        where: { userId },
        data: { lastUsedAt: new Date() },
      });
      await clearUserFactorAttempts(STEP_UP_SCOPE, userId);
      return { ok: true, method: "2FA" };
    }

    // consumeBackupCode stamps lastUsedAt itself when it removes the code.
    if (
      await consumeBackupCode(userId, twoFactorAuth.backupCodes, twoFactorToken)
    ) {
      await clearUserFactorAttempts(STEP_UP_SCOPE, userId);
      return { ok: true, method: "2FA" };
    }

    return { ok: false, status: 400, error: "Invalid authentication code" };
  }

  const { currentPassword } = credentials;
  if (!currentPassword || typeof currentPassword !== "string") {
    return {
      ok: false,
      status: 400,
      error: `Your current password is required to ${actionLabel}`,
      code: "PASSWORD_REQUIRED",
    };
  }

  const limited = await limitAttempt(userId);
  if (limited) return limited;

  if (!(await compare(currentPassword, user.password))) {
    return { ok: false, status: 400, error: "Current password is incorrect" };
  }
  await clearUserFactorAttempts(STEP_UP_SCOPE, userId);
  return { ok: true, method: "PASSWORD" };
}

async function limitAttempt(userId: string): Promise<StepUpResult | null> {
  const attempt = await recordUserFactorAttempt(STEP_UP_SCOPE, userId);
  if (attempt.allowed) return null;
  return { ok: false, status: attempt.status, error: attempt.error };
}
