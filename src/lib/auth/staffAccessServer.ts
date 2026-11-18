/**
 * Staff access rules - the database side (Node runtime only). The rules and
 * the time maths are in src/lib/auth/staffAccess.ts.
 *
 * Every session issuer (sign-in routes, refresh, re-issue) calls
 * restrictionClaims() just before generateTokens(): it refuses the session or
 * returns the claims to put in it (accessUntil / dbp / pxe), which the proxy
 * then enforces on every request without a database call.
 */
import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSecurityAlertEmail } from "@/lib/email";
import { buildRateLimitKey, checkRateLimit } from "@/lib/rateLimit";
import {
  ACCESS_DENIED_MESSAGES,
  addDays,
  computeAccess,
  decideRestriction,
  officeDate,
  parseWeeklyHours,
  emptyWeeklyHours,
  type AccessDeniedCode,
  type AccessState,
  type RestrictionClaims,
} from "@/lib/auth/staffAccess";

/** Roles a SUPER_ADMIN can put access rules on (decided 2026-11-18). */
export const RESTRICTABLE_ROLES: ReadonlySet<string> = new Set([
  "ADMIN",
  "ACCOUNTING",
]);

export type StaffAccessSnapshot = {
  access: AccessState;
  requireDeviceBoundPasskey: boolean;
  passkeyExemptUntil: Date | null;
  graceMinutes: number;
  hoursEnabled: boolean;
};

/**
 * The account's rule evaluated at `now`, or null when it has none (or its
 * role can't be restricted - a rule left on an account promoted to
 * SUPER_ADMIN never applies).
 */
export async function loadStaffAccess(
  userId: string,
  role: string,
  now: Date = new Date(),
): Promise<StaffAccessSnapshot | null> {
  if (!RESTRICTABLE_ROLES.has(role)) return null;
  const rule = await prisma.staffAccessRule.findUnique({ where: { userId } });
  if (!rule) return null;

  const today = officeDate(now);
  const from = addDays(today, -1);
  const to = addDays(today, 1);
  const [windows, holidays] = await Promise.all([
    prisma.staffAccessWindow.findMany({
      where: {
        userId,
        endsAt: { gt: new Date(now.getTime() - 2 * 86_400_000) },
        startsAt: { lt: new Date(now.getTime() + 3 * 86_400_000) },
      },
      select: { startsAt: true, endsAt: true, kind: true },
    }),
    prisma.staffHoliday.findMany({
      where: {
        date: {
          gte: new Date(`${from}T00:00:00Z`),
          lte: new Date(`${to}T00:00:00Z`),
        },
        OR: [{ userId: null }, { userId }],
      },
      select: { date: true },
    }),
  ]);

  const parsed = parseWeeklyHours(rule.weeklyHours);
  const access = computeAccess({
    hoursEnabled: rule.hoursEnabled,
    weeklyHours: parsed.ok ? parsed.value : emptyWeeklyHours(),
    graceMinutes: rule.graceMinutes,
    windows,
    // @db.Date comes back as midnight UTC of that calendar day.
    holidays: holidays.map((h) => h.date.toISOString().slice(0, 10)),
    now,
  });

  return {
    access,
    requireDeviceBoundPasskey: rule.requireDeviceBoundPasskey,
    passkeyExemptUntil: rule.passkeyExemptUntil,
    graceMinutes: rule.graceMinutes,
    hoursEnabled: rule.hoursEnabled,
  };
}

export type RestrictionResult =
  | { ok: true; claims: RestrictionClaims }
  | { ok: false; code: AccessDeniedCode };

/**
 * Whether a session may be issued now, and the claims it must carry.
 * `viaBuiltInPasskey`: this sign-in used a built-in passkey (for a refresh or
 * re-issue: the old session's `dbp`).
 */
export async function restrictionClaims(
  userId: string,
  role: string,
  {
    viaBuiltInPasskey,
    now = new Date(),
  }: { viaBuiltInPasskey: boolean; now?: Date },
): Promise<RestrictionResult> {
  const snapshot = await loadStaffAccess(userId, role, now);
  if (!snapshot) return { ok: true, claims: {} };
  return decideRestriction({
    access: snapshot.access,
    requireDeviceBoundPasskey: snapshot.requireDeviceBoundPasskey,
    passkeyExemptUntil: snapshot.passkeyExemptUntil,
    viaBuiltInPasskey,
    now,
  });
}

/**
 * While an account must use its office passkey, the person can't add or
 * remove passkeys themselves - only a SUPER_ADMIN can remove one.
 */
export async function passkeysLocked(userId: string): Promise<boolean> {
  const rule = await prisma.staffAccessRule.findUnique({
    where: { userId },
    select: {
      requireDeviceBoundPasskey: true,
      user: { select: { role: true } },
    },
  });
  return (
    !!rule?.requireDeviceBoundPasskey && RESTRICTABLE_ROLES.has(rule.user.role)
  );
}

export function passkeysLockedResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        "Your passkeys are managed by a super admin. Ask them if you need to add or remove one.",
      code: "PASSKEY_LOCKED",
    },
    { status: 403 },
  );
}

/** The browser-reported authenticator attachment, or null if missing/odd. */
export function readAttachment(value: unknown): string | null {
  return value === "platform" || value === "cross-platform" ? value : null;
}

/** The 403 every issuer returns when a session is refused. */
export function accessDeniedResponse(code: AccessDeniedCode): NextResponse {
  return NextResponse.json(
    { error: ACCESS_DENIED_MESSAGES[code], code },
    { status: 403 },
  );
}

function requestMeta(headers: Headers) {
  return {
    ipAddress:
      headers.get("x-forwarded-for") || headers.get("x-real-ip") || "unknown",
    userAgent: headers.get("user-agent") || "unknown",
  };
}

/**
 * Emails every active SUPER_ADMIN, after the response. A failed send is
 * logged and never affects the request.
 */
export function notifySuperAdmins(
  alert: { subject: string; heading: string; message: string },
  headers: Headers,
): void {
  const meta = requestMeta(headers);
  after(async () => {
    try {
      const admins = await prisma.user.findMany({
        where: { role: "SUPER_ADMIN", isDeleted: false },
        select: { email: true },
      });
      for (const { email } of admins) {
        const result = await sendSecurityAlertEmail(email, {
          ...alert,
          ...meta,
        });
        if (!result.success) {
          console.error("[staffAccess] super admin alert failed:", email);
        }
      }
    } catch (error) {
      console.error("[staffAccess] super admin alert failed:", error);
    }
  });
}

/** Emails one person, after the response. */
export function notifyAccount(
  email: string,
  alert: { subject: string; heading: string; message: string },
  headers: Headers,
): void {
  const meta = requestMeta(headers);
  after(async () => {
    try {
      const result = await sendSecurityAlertEmail(email, { ...alert, ...meta });
      if (!result.success) console.error("[staffAccess] email failed:", email);
    } catch (error) {
      console.error("[staffAccess] email failed:", error);
    }
  });
}

/**
 * A refused session: an activity row, and an email to every SUPER_ADMIN at
 * most once per account per hour. Never throws - a failure here must not
 * turn a clean 403 into a 500.
 */
export async function reportBlock(
  user: { id: string; email: string; name?: string | null },
  loginId: string | null,
  code: AccessDeniedCode,
  headers: Headers,
): Promise<void> {
  const meta = requestMeta(headers);
  try {
    await prisma.userActivity.create({
      data: {
        userId: user.id,
        loginId,
        type: `ACCESS_BLOCKED_${code}`,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    const limit = await checkRateLimit(
      buildRateLimitKey("staff_access_block", "user", user.id),
      { max: 1, windowSeconds: 60 * 60 },
    );
    if (!limit.allowed) return;
    const who = user.name ? `${user.name} (${user.email})` : user.email;
    notifySuperAdmins(
      code === "OUTSIDE_HOURS"
        ? {
            subject: "Staff Sign-In Blocked: Outside Working Hours",
            heading: "Sign-in blocked outside working hours",
            message: `${who} tried to use BitFactory outside their set working hours and was blocked. Further attempts in the next hour won't be emailed. You can add time or an exception on the Access Rules page.`,
          }
        : {
            subject: "Staff Sign-In Blocked: Office Passkey Required",
            heading: "Sign-in blocked without the office passkey",
            message: `${who} tried to sign in without the passkey on their office computer and was blocked. Further attempts in the next hour won't be emailed. If they need access from elsewhere, you can set a passkey exception on the Access Rules page.`,
          },
      headers,
    );
  } catch (error) {
    console.error("[staffAccess] reportBlock failed:", error);
  }
}
