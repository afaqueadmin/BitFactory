import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { generateBackupCodes, hashBackupCodes } from "@/lib/auth/backupCodes";
import {
  clearUserFactorAttempts,
  recordUserFactorAttempt,
} from "@/lib/rateLimit";

/**
 * Authenticator-app enrollment, shared by the settings page
 * (/api/auth/2fa/setup + /verify, signed-in session) and the forced setup at
 * login (/api/auth/2fa/enroll/*, enrollment token). Node runtime only.
 */

/** Creates a new secret for the user and returns it with its QR code. */
export async function beginTwoFactorSetup(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  const secret = speakeasy.generateSecret({
    name: `BitFactory: ${user?.email}`,
  });
  const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

  // Stored as pending: any existing 2FA keeps working (secret/enabled are
  // untouched) until a code from the new secret is confirmed (C-2). Row may
  // not exist yet for a user's first-ever setup - upsert covers that too.
  await prisma.twoFactorAuth.upsert({
    where: { userId },
    create: { userId, pendingSecret: secret.base32, enabled: false },
    update: { pendingSecret: secret.base32 },
  });

  return { secret: secret.base32, qrCode };
}

export type CompleteSetupResult =
  | { ok: true; backupCodes: string[] }
  | { ok: false; status: 400 | 429 | 503; error: string };

const CONFIRM_SCOPE = "2fa_confirm";

/**
 * Confirms the first code from the authenticator app, enables 2FA and returns
 * fresh backup codes (plaintext, shown once; stored hashed).
 */
export async function completeTwoFactorSetup(
  userId: string,
  code: unknown,
): Promise<CompleteSetupResult> {
  if (!code || typeof code !== "string") {
    return { ok: false, status: 400, error: "Token is required" };
  }

  const twoFactorAuth = await prisma.twoFactorAuth.findUnique({
    where: { userId },
    select: { secret: true, pendingSecret: true, enabled: true },
  });
  // The setup in progress; setups started before pendingSecret existed left
  // their new secret in `secret` with 2FA off.
  const newSecret =
    twoFactorAuth?.pendingSecret ??
    (twoFactorAuth && !twoFactorAuth.enabled ? twoFactorAuth.secret : null);
  if (!newSecret) {
    return { ok: false, status: 400, error: "2FA has not been set up" };
  }

  // N-1: limited like every other code check made inside a session.
  const attempt = await recordUserFactorAttempt(CONFIRM_SCOPE, userId);
  if (!attempt.allowed) {
    return { ok: false, status: attempt.status, error: attempt.error };
  }

  const verified = speakeasy.totp.verify({
    secret: newSecret,
    encoding: "base32",
    token: code,
    window: 1, // Allow 1 time step before/after for clock drift
  });
  if (!verified) {
    return { ok: false, status: 400, error: "Invalid token" };
  }
  await clearUserFactorAttempts(CONFIRM_SCOPE, userId);

  // The new authenticator replaces any previous one, with fresh backup codes.
  const backupCodes = generateBackupCodes();
  await prisma.twoFactorAuth.update({
    where: { userId },
    data: {
      enabled: true,
      secret: newSecret,
      pendingSecret: null,
      backupCodes: await hashBackupCodes(backupCodes),
      enrolledAt: new Date(),
    },
  });

  return { ok: true, backupCodes };
}
