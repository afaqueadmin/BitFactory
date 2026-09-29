import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { generateBackupCodes, hashBackupCodes } from "@/lib/auth/backupCodes";

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

  // Row may not exist yet for a user's first-ever setup - upsert covers both
  // that and a re-run (e.g. scanning a fresh QR code).
  await prisma.twoFactorAuth.upsert({
    where: { userId },
    create: { userId, secret: secret.base32, enabled: false },
    update: { secret: secret.base32, enabled: false },
  });

  return { secret: secret.base32, qrCode };
}

export type CompleteSetupResult =
  | { ok: true; backupCodes: string[] }
  | { ok: false; error: string };

/**
 * Confirms the first code from the authenticator app, enables 2FA and returns
 * fresh backup codes (plaintext, shown once; stored hashed).
 */
export async function completeTwoFactorSetup(
  userId: string,
  code: unknown,
): Promise<CompleteSetupResult> {
  if (!code || typeof code !== "string") {
    return { ok: false, error: "Token is required" };
  }

  const twoFactorAuth = await prisma.twoFactorAuth.findUnique({
    where: { userId },
    select: { secret: true },
  });
  if (!twoFactorAuth?.secret) {
    return { ok: false, error: "2FA has not been set up" };
  }

  const verified = speakeasy.totp.verify({
    secret: twoFactorAuth.secret,
    encoding: "base32",
    token: code,
    window: 1, // Allow 1 time step before/after for clock drift
  });
  if (!verified) {
    return { ok: false, error: "Invalid token" };
  }

  const backupCodes = generateBackupCodes();
  await prisma.twoFactorAuth.update({
    where: { userId },
    data: {
      enabled: true,
      backupCodes: await hashBackupCodes(backupCodes),
      enrolledAt: new Date(),
    },
  });

  return { ok: true, backupCodes };
}
