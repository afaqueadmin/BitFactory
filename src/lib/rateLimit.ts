/**
 * Postgres-backed attempt counter for auth endpoints (login, 2FA, reset...).
 * Backed by the auth_attempts table; Node runtime only (Prisma).
 *
 * Callers decide what to do on `allowed: false` and whether to fail open or
 * closed if the database itself errors - errors are not swallowed here.
 */
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

  return { allowed: false, remaining: 0, retryAfterSeconds };
}

/**
 * Forgets every recorded attempt for `key`, e.g. once a login succeeds. Only
 * use this on the per-account axis: clearing an IP key on success would let a
 * valid login reset the budget of an attacker guessing from that IP.
 */
export async function clearRateLimit(key: string): Promise<void> {
  await prisma.authAttempt.deleteMany({ where: { key } });
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
