/**
 * Postgres-backed attempt counter for auth endpoints (login, 2FA, reset...).
 * Backed by the auth_attempts table; Node runtime only (Prisma).
 *
 * Callers decide what to do on `allowed: false` and whether to fail open or
 * closed if the database itself errors - errors are not swallowed here.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rows older than this are purged, so no window may be longer than it.
const MAX_WINDOW_SECONDS = 24 * 60 * 60;
const PURGE_PROBABILITY = 0.01;
const MAX_IDENTIFIER_LENGTH = 254;

export interface RateLimitOptions {
  /** Attempts permitted per window. */
  max: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  /** Whether this attempt is within the limit. */
  allowed: boolean;
  remaining: number;
  /** Seconds until an attempt would be allowed again; 0 when allowed. */
  retryAfterSeconds: number;
  /** Attempts in the window, this one included. */
  used: number;
}

export function buildRateLimitKey(
  scope: string,
  axis: "ip" | "email" | "user",
  identifier: string,
): string {
  const normalized = identifier
    .trim()
    .toLowerCase()
    .slice(0, MAX_IDENTIFIER_LENGTH);
  return `${scope}:${axis}:${normalized}`;
}

/**
 * Returns null when no client IP header is present, and callers should then
 * skip the IP axis rather than key on a placeholder: a shared "unknown" bucket
 * would rate-limit every such user together. Behind Vercel these headers are
 * set by the platform; anywhere else a client could spoof them, which is why
 * the per-email/user axis must always be applied as well.
 */
export function getClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get("x-real-ip")?.trim() || null;
}

/**
 * Records one attempt against `key` and reports whether it is within the
 * limit. The attempt is recorded before counting so a burst of parallel
 * requests can't all pass a stale count - at most `max` of them see
 * `allowed: true`. Blocked attempts are recorded too, so hammering extends
 * the lockout.
 */
export async function checkRateLimit(
  key: string,
  { max, windowSeconds }: RateLimitOptions,
): Promise<RateLimitResult> {
  if (!(windowSeconds > 0) || windowSeconds > MAX_WINDOW_SECONDS) {
    throw new RangeError(
      `windowSeconds must be between 1 and ${MAX_WINDOW_SECONDS}`,
    );
  }

  await prisma.authAttempt.create({ data: { key } });
  await purgeExpiredSometimes();

  const now = Date.now();
  const where = {
    key,
    createdAt: { gt: new Date(now - windowSeconds * 1000) },
  };
  const used = await prisma.authAttempt.count({ where });

  if (used <= max) {
    return {
      allowed: true,
      remaining: Math.max(0, max - used),
      retryAfterSeconds: 0,
      used,
    };
  }

  // An attempt is allowed again once enough of the oldest rows have expired
  // for the count, including that attempt, to fit within `max` - i.e. once
  // the (used - max)th-oldest row (0-indexed) leaves the window.
  const blockingRow = await prisma.authAttempt.findFirst({
    where,
    orderBy: { createdAt: "asc" },
    skip: used - max,
    select: { createdAt: true },
  });
  const retryAfterSeconds = blockingRow
    ? Math.max(
        1,
        Math.ceil(
          (blockingRow.createdAt.getTime() + windowSeconds * 1000 - now) / 1000,
        ),
      )
    : windowSeconds;

  return { allowed: false, remaining: 0, retryAfterSeconds, used };
}

/**
 * Forgets every recorded attempt for `key`, e.g. once a login succeeds. Only
 * use this on the per-account axis: clearing an IP key on success would let a
 * valid login reset the budget of an attacker guessing from that IP.
 */
export async function clearRateLimit(key: string): Promise<void> {
  await prisma.authAttempt.deleteMany({ where: { key } });
}

export const DEFAULT_AUTH_RATE_LIMITS = {
  perEmail: { max: 10, windowSeconds: 15 * 60 } satisfies RateLimitOptions,
  perIp: { max: 30, windowSeconds: 15 * 60 } satisfies RateLimitOptions,
};

export interface AuthRateLimitOutcome {
  email: RateLimitResult | null;
  ip: RateLimitResult | null;
  /** True if either axis (present and checked) was over its limit. */
  blocked: boolean;
}

/**
 * Checks the per-email and per-IP axes for an auth action together, so
 * neither alone is a workaround (an attacker spreading guesses across IPs is
 * still caught by email; one behind a shared/NAT IP is still caught by IP).
 * An axis is skipped, not counted as blocked, when its identifier is absent
 * (e.g. `getClientIp` returned null) - see its docstring for why.
 *
 * Auth routes go through enforceAuthRateLimit, which turns "blocked" into a
 * 429.
 */
export async function checkAuthRateLimit(
  scope: string,
  identifiers: { email?: string | null; ip?: string | null },
  limits: {
    perEmail?: RateLimitOptions;
    perIp?: RateLimitOptions;
  } = {},
): Promise<AuthRateLimitOutcome> {
  const perEmail = limits.perEmail ?? DEFAULT_AUTH_RATE_LIMITS.perEmail;
  const perIp = limits.perIp ?? DEFAULT_AUTH_RATE_LIMITS.perIp;

  const [email, ip] = await Promise.all([
    identifiers.email
      ? checkRateLimit(
          buildRateLimitKey(scope, "email", identifiers.email),
          perEmail,
        )
      : Promise.resolve(null),
    identifiers.ip
      ? checkRateLimit(buildRateLimitKey(scope, "ip", identifiers.ip), perIp)
      : Promise.resolve(null),
  ]);

  return {
    email,
    ip,
    blocked: Boolean((email && !email.allowed) || (ip && !ip.allowed)),
  };
}

const TOO_MANY_ATTEMPTS = "Too many attempts. Please wait and try again.";

/**
 * Enforcing wrapper for auth routes: records the attempt and returns a 429
 * response to send back if either axis is over its limit, else null.
 *
 * Fails open - if the attempt store itself errors, the request proceeds
 * (logged). Failing closed would turn any database blip into a full login
 * outage, and each route still has its own credential check.
 */
export async function enforceAuthRateLimit(
  scope: string,
  identifiers: { email?: string | null; ip?: string | null },
  limits?: { perEmail?: RateLimitOptions; perIp?: RateLimitOptions },
): Promise<NextResponse | null> {
  let outcome: AuthRateLimitOutcome;
  try {
    outcome = await checkAuthRateLimit(scope, identifiers, limits);
  } catch (error) {
    console.error(`[rateLimit] ${scope} check failed, allowing:`, error);
    return null;
  }
  if (!outcome.blocked) return null;

  const retryAfterSeconds = Math.max(
    outcome.email && !outcome.email.allowed
      ? outcome.email.retryAfterSeconds
      : 0,
    outcome.ip && !outcome.ip.allowed ? outcome.ip.retryAfterSeconds : 0,
  );
  console.warn(`[rateLimit] ${scope} blocked`, {
    email: identifiers.email,
    ip: identifiers.ip,
    emailBlocked: outcome.email ? !outcome.email.allowed : null,
    ipBlocked: outcome.ip ? !outcome.ip.allowed : null,
    retryAfterSeconds,
  });
  return NextResponse.json(
    { error: TOO_MANY_ATTEMPTS, retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

/**
 * After a successful authentication, forget that account's attempts for
 * `scope` so legitimate repeat logins never add up to a lockout - only
 * failures accumulate. Per-email axis only (see clearRateLimit). Never fails
 * the caller.
 */
export async function clearAuthRateLimitForEmail(
  scope: string,
  email: string,
): Promise<void> {
  try {
    await clearRateLimit(buildRateLimitKey(scope, "email", email));
  } catch (error) {
    console.error(`[rateLimit] Failed to clear ${scope} attempts:`, error);
  }
}

/**
 * Per-user limit on submitting a password or 2FA code from inside a signed-in
 * session (step-up re-verification, 2FA disable/confirm, password change).
 * These are what stop a stolen session from guessing its way to the password
 * or a 2FA code (N-1). Only one account is involved, so there is no IP axis.
 */
export const USER_FACTOR_LIMIT: RateLimitOptions = {
  max: 5,
  windowSeconds: 15 * 60,
};

export type UserFactorAttempt =
  | { allowed: true }
  | { allowed: false; status: 429; error: string; retryAfterSeconds: number }
  | { allowed: false; status: 503; error: string };

/**
 * Records one password/code submission for `userId` under `scope` and says
 * whether it may be checked. Call it only when a credential was actually
 * sent, and call clearUserFactorAttempts after it verifies, so only failures
 * add up.
 *
 * Fails closed: if the attempt store errors, the action is refused. Unlike
 * login, these are rare actions by one signed-in user, and each of them
 * writes to the same database anyway.
 */
export async function recordUserFactorAttempt(
  scope: string,
  userId: string,
  limit: RateLimitOptions = USER_FACTOR_LIMIT,
): Promise<UserFactorAttempt> {
  let result: RateLimitResult;
  try {
    result = await checkRateLimit(
      buildRateLimitKey(scope, "user", userId),
      limit,
    );
  } catch (error) {
    console.error(`[rateLimit] ${scope} check failed, refusing:`, error);
    return {
      allowed: false,
      status: 503,
      error: "Couldn't verify right now. Please try again in a moment.",
    };
  }
  if (result.allowed) return { allowed: true };

  console.warn(`[rateLimit] ${scope} blocked`, {
    userId,
    retryAfterSeconds: result.retryAfterSeconds,
  });
  const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
  return {
    allowed: false,
    status: 429,
    error: `Too many incorrect attempts. Please wait ${minutes} minute${
      minutes === 1 ? "" : "s"
    } and try again.`,
    retryAfterSeconds: result.retryAfterSeconds,
  };
}

/** Forgets `userId`'s attempts for `scope` after a success. Never fails. */
export async function clearUserFactorAttempts(
  scope: string,
  userId: string,
): Promise<void> {
  try {
    await clearRateLimit(buildRateLimitKey(scope, "user", userId));
  } catch (error) {
    console.error(`[rateLimit] Failed to clear ${scope} attempts:`, error);
  }
}

/**
 * Longer-term cap on 2FA codes at login (N-13), on top of the 15-minute
 * limit: 30 wrong codes in 24 hours locks the 2FA step for that account
 * until they age out. Only someone who already has the password reaches this
 * step, so a lock means the password is known - the owner gets an alert.
 */
export const TWO_FACTOR_LOGIN_DAILY_LIMIT: RateLimitOptions = {
  max: 30,
  windowSeconds: 24 * 60 * 60,
};
const TWO_FACTOR_LOGIN_DAILY_SCOPE = "2fa_validate_daily";

export type TwoFactorLoginAttempt =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; justLocked: boolean };

/**
 * Records one 2FA code submission at login for `userId`. A success must be
 * followed by clearTwoFactorLoginAttempts, so only failures add up.
 * `justLocked` is true only for the attempt that crossed the limit, so the
 * alert goes out once.
 *
 * Fails open, like the other login limits: a database blip mustn't lock
 * everyone out, and the 15-minute limit still applies.
 */
export async function recordTwoFactorLoginAttempt(
  userId: string,
): Promise<TwoFactorLoginAttempt> {
  let result: RateLimitResult;
  try {
    result = await checkRateLimit(
      buildRateLimitKey(TWO_FACTOR_LOGIN_DAILY_SCOPE, "user", userId),
      TWO_FACTOR_LOGIN_DAILY_LIMIT,
    );
  } catch (error) {
    console.error(
      `[rateLimit] ${TWO_FACTOR_LOGIN_DAILY_SCOPE} check failed, allowing:`,
      error,
    );
    return { allowed: true };
  }
  if (result.allowed) return { allowed: true };
  console.warn(`[rateLimit] ${TWO_FACTOR_LOGIN_DAILY_SCOPE} blocked`, {
    userId,
    retryAfterSeconds: result.retryAfterSeconds,
  });
  return {
    allowed: false,
    retryAfterSeconds: result.retryAfterSeconds,
    justLocked: result.used === TWO_FACTOR_LOGIN_DAILY_LIMIT.max + 1,
  };
}

export function clearTwoFactorLoginAttempts(userId: string): Promise<void> {
  return clearUserFactorAttempts(TWO_FACTOR_LOGIN_DAILY_SCOPE, userId);
}

// Keeps the table bounded without needing a cron job. Never fails the caller.
async function purgeExpiredSometimes(): Promise<void> {
  if (Math.random() >= PURGE_PROBABILITY) return;
  try {
    await prisma.authAttempt.deleteMany({
      where: {
        createdAt: { lt: new Date(Date.now() - MAX_WINDOW_SECONDS * 1000) },
      },
    });
  } catch (error) {
    console.error("[rateLimit] Failed to purge expired attempts:", error);
  }
}
