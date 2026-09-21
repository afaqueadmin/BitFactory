import { compare } from "bcrypt";
import speakeasy from "speakeasy";
import { prisma } from "@/lib/prisma";

/**
 * Step-up re-authentication for sensitive actions where a live session cookie
 * alone shouldn't be enough. Which factor is required is decided from the
 * user's own record, never from what the caller sends, so 2FA can't be dodged
 * by supplying a password instead.
 *
 * Same rules as the inline copy in POST /api/wallet/change-requests.
 * Node runtime only (Prisma + bcrypt).
 */

export interface StepUpCredentials {
  currentPassword?: unknown;
  twoFactorToken?: unknown;
}

export type StepUpResult =
  | { ok: true; method: "2FA" | "PASSWORD" }
  | {
      ok: false;
      status: 400 | 404;
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

    if (twoFactorAuth.backupCodes?.includes(twoFactorToken)) {
      await prisma.twoFactorAuth.update({
        where: { userId },
        data: {
          backupCodes: {
            set: twoFactorAuth.backupCodes.filter(
              (code) => code !== twoFactorToken,
            ),
          },
          lastUsedAt: new Date(),
        },
      });
      return { ok: true, method: "2FA" };
    }

    const verified =
      !!twoFactorAuth.secret &&
      speakeasy.totp.verify({
        secret: twoFactorAuth.secret,
        encoding: "base32",
        token: twoFactorToken,
        window: 1,
      });
    if (!verified) {
      return { ok: false, status: 400, error: "Invalid authentication code" };
    }

    await prisma.twoFactorAuth.update({
      where: { userId },
      data: { lastUsedAt: new Date() },
    });
    return { ok: true, method: "2FA" };
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
  if (!(await compare(currentPassword, user.password))) {
    return { ok: false, status: 400, error: "Current password is incorrect" };
  }
  return { ok: true, method: "PASSWORD" };
}
