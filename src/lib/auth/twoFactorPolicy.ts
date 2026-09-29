/**
 * Mandatory 2FA (M-1). Every role must have authenticator-app 2FA. Until the
 * enforcement date there's a grace period: password logins without 2FA still
 * succeed and the app shows a reminder. From that date, a password login
 * without 2FA must set it up before getting a session.
 *
 * Passkey logins are a second factor on their own, so they are never blocked.
 *
 * The date can be moved without a code change via TWO_FACTOR_ENFORCE_FROM
 * (any ISO date string).
 */

// 14 days after the 2026-09-29 rollout, midnight UAE time.
const DEFAULT_ENFORCE_FROM = "2026-10-13T00:00:00+04:00";

const REQUIRED_ROLES = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "FRANCHISEE",
  "CLIENT",
]);

export function twoFactorEnforceFrom(): Date {
  const fromEnv = process.env.TWO_FACTOR_ENFORCE_FROM;
  const parsed = fromEnv ? new Date(fromEnv) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed
    : new Date(DEFAULT_ENFORCE_FROM);
}

export type TwoFactorRequirement =
  /** Has 2FA, or the role doesn't need it. */
  | "satisfied"
  /** Needs 2FA; still within the grace period. */
  | "grace"
  /** Needs 2FA and the grace period is over. */
  | "enforced";

export function twoFactorRequirement(
  role: string,
  twoFactorEnabled: boolean,
  now: Date = new Date(),
): TwoFactorRequirement {
  if (twoFactorEnabled || !REQUIRED_ROLES.has(role)) return "satisfied";
  return now < twoFactorEnforceFrom() ? "grace" : "enforced";
}
