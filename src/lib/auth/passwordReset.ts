/**
 * Forgotten-password reset by emailed link (C-1).
 *
 * /api/user/forgot-password emails a signed, 30-minute link and changes
 * nothing. The password only changes when the link is used on
 * /reset-password, which also asks for a 2FA code when the account has 2FA.
 * Each link works once: it's spent with a tokenBlacklist insert, and it also
 * carries a fingerprint of the password hash, so any password change kills
 * every link sent before it.
 *
 * Node runtime only (Prisma).
 */
import { createHash } from "crypto";
import { verifyPasswordResetToken } from "@/lib/jwt";
import { findLoginById } from "@/lib/auth/loginIdentity";
import { isTokenBlacklisted } from "@/lib/auth/tokenBlacklist";

export const RESET_LINK_MINUTES = 30;

// Never built from the request's Host header: a forged Host would make the
// emailed link (and the token in it) point at someone else's site.
const DEFAULT_APP_URL = "https://my.bitfactory.ae";

export function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.origin;
      }
    } catch {
      // Malformed - fall through to the default.
    }
    console.error(
      "[passwordReset] NEXT_PUBLIC_APP_URL is not a valid URL; using default",
    );
  }
  return DEFAULT_APP_URL;
}

/** The token goes in the fragment, so it never reaches server or proxy logs. */
export function resetLinkUrl(token: string): string {
  return `${appBaseUrl()}/reset-password#token=${encodeURIComponent(token)}`;
}

/** Short, non-reversible fingerprint of a stored password hash. */
export function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 32);
}

export type ResetTarget = {
  userId: string;
  /** The login whose password the link resets - only that one. */
  loginId: string;
  email: string;
  /** The hash the link was issued against - the reset only applies while
   *  it's still the current one. */
  passwordHash: string;
  token: string;
  expiresAt: Date;
  twoFactor: {
    secret: string | null;
    backupCodes: string[];
  } | null;
};

/**
 * The account a reset link is for, or null if the link is invalid, expired,
 * already used, superseded by a password change, or the account is gone.
 * Callers show one generic message for every null.
 */
export async function resolveResetLink(
  token: unknown,
): Promise<ResetTarget | null> {
  if (typeof token !== "string" || !token || token.length > 2048) return null;
  let claims: { userId: string; loginId: string; pwd: string; exp?: number };
  try {
    claims = await verifyPasswordResetToken(token);
  } catch {
    return null;
  }
  if (await isTokenBlacklisted(token)) return null;

  const login = await findLoginById(claims.loginId);
  if (
    !login ||
    login.userId !== claims.userId ||
    passwordFingerprint(login.password) !== claims.pwd
  ) {
    return null;
  }

  return {
    userId: login.userId,
    loginId: login.id,
    email: login.email,
    passwordHash: login.password,
    token,
    expiresAt: new Date(
      (claims.exp ?? Math.floor(Date.now() / 1000) + RESET_LINK_MINUTES * 60) *
        1000,
    ),
    twoFactor: login.twoFactorAuth?.enabled
      ? {
          secret: login.twoFactorAuth.secret,
          backupCodes: login.twoFactorAuth.backupCodes,
        }
      : null,
  };
}
