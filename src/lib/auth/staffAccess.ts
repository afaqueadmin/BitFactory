/**
 * Staff access rules: office hours and device-bound passkeys for selected
 * ADMIN / ACCOUNTING accounts (set by a SUPER_ADMIN on /access-rules).
 *
 * Pure logic only - no Prisma, no Next imports - so it is unit-tested on its
 * own and safe anywhere. The DB side is src/lib/auth/staffAccessServer.ts.
 *
 * Times: a schedule is office wall-clock time in OFFICE_TIME_ZONE. Allowed
 * time is a set of intervals (today's hours + grace, one-off windows, extra
 * time); an account may work while `now` is inside one, until the end of the
 * continuous run of intervals around `now` (accessUntil). That end goes into
 * the session token and the proxy cuts the session off there.
 */

export const OFFICE_TIME_ZONE = "Asia/Karachi";

/** Longest a passkey exception may run ahead (decided 2026-11-18). */
export const MAX_PASSKEY_EXEMPT_DAYS = 7;

export const DAY_KEYS = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type DayHours = { start: string; end: string } | null;
export type WeeklyHours = Record<DayKey, DayHours>;

export type AccessPhase =
  /** The account has no hours limit. */
  | "unrestricted"
  /** Inside the scheduled hours. */
  | "normal"
  /** After the scheduled end, inside the grace period. */
  | "grace"
  /** Inside a one-off window or extra time. */
  | "extra"
  /** Not allowed now. */
  | "closed";

export type AccessState = {
  allowed: boolean;
  phase: AccessPhase;
  /** End of the continuous allowed run around now; null when unrestricted
   *  or closed. */
  accessUntil: Date | null;
  /** Today's scheduled end and end of grace, when today has hours. */
  scheduledEnd: Date | null;
  graceEnd: Date | null;
};

export type AccessWindowInput = {
  startsAt: Date;
  endsAt: Date;
  kind: "ONE_OFF" | "EXTRA_TIME";
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ---------------------------------------------------------------------------
// Time zone helpers
// ---------------------------------------------------------------------------

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: OFFICE_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function officeParts(date: Date) {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFormatter.formatToParts(date)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return p as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

/** Milliseconds the office clock is ahead of UTC at `date`. */
function officeOffsetMs(date: Date): number {
  const p = officeParts(date);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant of an office wall-clock time. */
export function officeTimeToDate(ymd: string, hhmm: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  return new Date(guess - officeOffsetMs(new Date(guess)));
}

/** "YYYY-MM-DD" of `date` on the office calendar. */
export function officeDate(date: Date): string {
  const p = officeParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The office calendar day `days` after `ymd`. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

function weekdayOf(ymd: string): DayKey {
  const [y, m, d] = ymd.split("-").map(Number);
  return DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// ---------------------------------------------------------------------------
// Weekly hours
// ---------------------------------------------------------------------------

export function emptyWeeklyHours(): WeeklyHours {
  return {
    sun: null,
    mon: null,
    tue: null,
    wed: null,
    thu: null,
    fri: null,
    sat: null,
  };
}

/**
 * Validates weekly hours from a request or the DB. Each day is null (off) or
 * { start, end } as "HH:MM" with end after start (no shifts past midnight).
 */
export function parseWeeklyHours(
  input: unknown,
): { ok: true; value: WeeklyHours } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Weekly hours are required" };
  }
  const src = input as Record<string, unknown>;
  const value = emptyWeeklyHours();
  for (const day of DAY_KEYS) {
    const entry = src[day];
    if (entry === null || entry === undefined) continue;
    if (typeof entry !== "object") {
      return { ok: false, error: `Invalid hours for ${day}` };
    }
    const { start, end } = entry as { start?: unknown; end?: unknown };
    if (typeof start !== "string" || typeof end !== "string") {
      return { ok: false, error: `Start and end are required for ${day}` };
    }
    if (!HHMM.test(start) || !HHMM.test(end)) {
      return { ok: false, error: `Times for ${day} must be HH:MM` };
    }
    if (end <= start) {
      return {
        ok: false,
        error: `End must be after start for ${day} (shifts past midnight aren't supported)`,
      };
    }
    value[day] = { start, end };
  }
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// The allowed-time computation
// ---------------------------------------------------------------------------

type Interval = {
  start: number;
  end: number;
  kind: "normal" | "grace" | "extra";
};

/**
 * Whether the account may work at `now`, and until when.
 *
 * `holidays` are office dates ("YYYY-MM-DD") that are off for this account:
 * office-wide holidays plus its own. Scheduled hours don't apply on them; a
 * one-off window still does.
 */
export function computeAccess({
  hoursEnabled,
  weeklyHours,
  graceMinutes,
  windows,
  holidays,
  now,
}: {
  hoursEnabled: boolean;
  weeklyHours: WeeklyHours;
  graceMinutes: number;
  windows: AccessWindowInput[];
  holidays: string[];
  now: Date;
}): AccessState {
  if (!hoursEnabled) {
    return {
      allowed: true,
      phase: "unrestricted",
      accessUntil: null,
      scheduledEnd: null,
      graceEnd: null,
    };
  }

  const holidaySet = new Set(holidays);
  const today = officeDate(now);
  const graceMs = Math.max(0, graceMinutes) * 60_000;
  const intervals: Interval[] = [];
  let scheduledEnd: Date | null = null;
  let graceEnd: Date | null = null;

  // Yesterday and tomorrow too, so runs that touch midnight join up.
  for (const offset of [-1, 0, 1]) {
    const day = addDays(today, offset);
    if (holidaySet.has(day)) continue;
    const hours = weeklyHours[weekdayOf(day)];
    if (!hours) continue;
    const start = officeTimeToDate(day, hours.start).getTime();
    const end = officeTimeToDate(day, hours.end).getTime();
    intervals.push({ start, end, kind: "normal" });
    if (graceMs > 0)
      intervals.push({ start: end, end: end + graceMs, kind: "grace" });
    if (offset === 0) {
      scheduledEnd = new Date(end);
      graceEnd = new Date(end + graceMs);
    }
  }
  for (const w of windows) {
    const start = w.startsAt.getTime();
    const end = w.endsAt.getTime();
    if (end > start) intervals.push({ start, end, kind: "extra" });
  }

  const t = now.getTime();
  const containing = intervals.filter((i) => i.start <= t && t < i.end);
  if (containing.length === 0) {
    return {
      allowed: false,
      phase: "closed",
      accessUntil: null,
      scheduledEnd,
      graceEnd,
    };
  }

  // Grow the run around now: any interval that overlaps or touches it joins.
  let runStart = Math.min(...containing.map((i) => i.start));
  let runEnd = Math.max(...containing.map((i) => i.end));
  let grew = true;
  while (grew) {
    grew = false;
    for (const i of intervals) {
      if (i.start <= runEnd && i.end >= runStart) {
        if (i.start < runStart) {
          runStart = i.start;
          grew = true;
        }
        if (i.end > runEnd) {
          runEnd = i.end;
          grew = true;
        }
      }
    }
  }

  const phase: AccessPhase = containing.some((i) => i.kind === "normal")
    ? "normal"
    : containing.some((i) => i.kind === "grace")
      ? "grace"
      : "extra";

  return {
    allowed: true,
    phase,
    accessUntil: new Date(runEnd),
    scheduledEnd,
    graceEnd,
  };
}

// ---------------------------------------------------------------------------
// Passkeys and the sign-in decision
// ---------------------------------------------------------------------------

/**
 * A passkey that lives in this one device's own hardware (Windows Hello / the
 * PC's TPM): single-device and a platform authenticator. Synced passkeys
 * (multiDevice) and USB/NFC keys (cross-platform) don't count. Unknown (null,
 * from before these fields were saved) doesn't count either.
 */
export function isBuiltInPasskey(cred: {
  deviceType: string | null | undefined;
  attachment: string | null | undefined;
}): boolean {
  return cred.deviceType === "singleDevice" && cred.attachment === "platform";
}

export type RestrictionClaims = {
  /** Epoch seconds; the proxy blocks the session after it. */
  accessUntil?: number;
  /** Signed in with a built-in passkey. */
  dbp?: true;
  /** Signed in under the emergency passkey exception. */
  pxe?: true;
};

export type AccessDeniedCode = "OUTSIDE_HOURS" | "PASSKEY_REQUIRED";

/**
 * The decision every session issuer makes (sign-in and refresh alike).
 * `viaBuiltInPasskey`: this sign-in used a built-in passkey (for a refresh,
 * the old session's `dbp`).
 */
export function decideRestriction({
  access,
  requireDeviceBoundPasskey,
  passkeyExemptUntil,
  viaBuiltInPasskey,
  now,
}: {
  access: AccessState;
  requireDeviceBoundPasskey: boolean;
  passkeyExemptUntil: Date | null;
  viaBuiltInPasskey: boolean;
  now: Date;
}):
  | { ok: true; claims: RestrictionClaims }
  | { ok: false; code: AccessDeniedCode } {
  if (!access.allowed) return { ok: false, code: "OUTSIDE_HOURS" };

  const claims: RestrictionClaims = {};
  let until = access.accessUntil?.getTime() ?? null;

  if (requireDeviceBoundPasskey) {
    if (viaBuiltInPasskey) {
      claims.dbp = true;
    } else if (
      passkeyExemptUntil &&
      passkeyExemptUntil.getTime() > now.getTime()
    ) {
      claims.pxe = true;
      const exemptEnd = passkeyExemptUntil.getTime();
      until = until === null ? exemptEnd : Math.min(until, exemptEnd);
    } else {
      return { ok: false, code: "PASSKEY_REQUIRED" };
    }
  }

  if (until !== null) claims.accessUntil = Math.floor(until / 1000);
  return { ok: true, claims };
}

/** Messages shown on the login page and returned by the issuers. */
export const ACCESS_DENIED_MESSAGES: Record<AccessDeniedCode, string> = {
  OUTSIDE_HOURS:
    "Your account can only be used during your set working hours. Ask a super admin if you need extra time.",
  PASSKEY_REQUIRED:
    "Your account can only be signed in to with the passkey on your office computer.",
};
