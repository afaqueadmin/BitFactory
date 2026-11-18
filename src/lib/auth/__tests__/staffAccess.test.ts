import { describe, expect, it } from "vitest";
import {
  addDays,
  computeAccess,
  decideRestriction,
  emptyWeeklyHours,
  isBuiltInPasskey,
  officeDate,
  officeTimeToDate,
  parseWeeklyHours,
  type WeeklyHours,
} from "@/lib/auth/staffAccess";

// Office time is Asia/Karachi (UTC+05:00, no daylight saving).
const pkt = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+05:00`);

// 2026-11-16 is a Monday, 2026-11-22 a Sunday.
const MON = "2026-11-16";
const SUN = "2026-11-22";

const monSat10to18: WeeklyHours = {
  ...emptyWeeklyHours(),
  mon: { start: "10:00", end: "18:00" },
  tue: { start: "10:00", end: "18:00" },
  wed: { start: "10:00", end: "18:00" },
  thu: { start: "10:00", end: "18:00" },
  fri: { start: "10:00", end: "18:00" },
  sat: { start: "10:00", end: "18:00" },
};

const base = {
  hoursEnabled: true,
  weeklyHours: monSat10to18,
  graceMinutes: 30,
  windows: [],
  holidays: [] as string[],
};

describe("office time helpers", () => {
  it("converts office wall time to the right instant", () => {
    expect(officeTimeToDate(MON, "10:00").toISOString()).toBe(
      "2026-11-16T05:00:00.000Z",
    );
    // 05:00 PKT is midnight UTC: the office date must not be the UTC date.
    expect(officeTimeToDate(MON, "03:00").toISOString()).toBe(
      "2026-11-15T22:00:00.000Z",
    );
    expect(officeDate(new Date("2026-11-15T22:00:00Z"))).toBe(MON);
  });

  it("adds calendar days across a month end", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-01", -1)).toBe("2026-11-30");
  });
});

describe("parseWeeklyHours", () => {
  it("accepts days off and HH:MM windows", () => {
    const r = parseWeeklyHours({
      mon: { start: "10:00", end: "18:00" },
      sun: null,
    });
    expect(r.ok && r.value.mon).toEqual({ start: "10:00", end: "18:00" });
    expect(r.ok && r.value.sun).toBeNull();
    expect(r.ok && r.value.tue).toBeNull();
  });

  it("refuses bad times and shifts past midnight", () => {
    expect(parseWeeklyHours({ mon: { start: "9:00", end: "18:00" } }).ok).toBe(
      false,
    );
    expect(parseWeeklyHours({ mon: { start: "22:00", end: "06:00" } }).ok).toBe(
      false,
    );
    expect(parseWeeklyHours({ mon: { start: "10:00", end: "10:00" } }).ok).toBe(
      false,
    );
    expect(parseWeeklyHours(null).ok).toBe(false);
  });
});

describe("computeAccess", () => {
  it("is unrestricted when hours are off", () => {
    const s = computeAccess({
      ...base,
      hoursEnabled: false,
      now: pkt(SUN, "03:00"),
    });
    expect(s).toMatchObject({
      allowed: true,
      phase: "unrestricted",
      accessUntil: null,
    });
  });

  it("allows scheduled hours, until the end of grace", () => {
    const s = computeAccess({ ...base, now: pkt(MON, "12:00") });
    expect(s.allowed).toBe(true);
    expect(s.phase).toBe("normal");
    expect(s.accessUntil?.toISOString()).toBe(pkt(MON, "18:30").toISOString());
    expect(s.scheduledEnd?.toISOString()).toBe(pkt(MON, "18:00").toISOString());
    expect(s.graceEnd?.toISOString()).toBe(pkt(MON, "18:30").toISOString());
  });

  it("is in grace between the end and end + grace, and closed after", () => {
    expect(computeAccess({ ...base, now: pkt(MON, "18:00") }).phase).toBe(
      "grace",
    );
    expect(computeAccess({ ...base, now: pkt(MON, "18:29") }).phase).toBe(
      "grace",
    );
    expect(computeAccess({ ...base, now: pkt(MON, "18:30") }).allowed).toBe(
      false,
    );
  });

  it("is closed before the start and on a day off", () => {
    expect(computeAccess({ ...base, now: pkt(MON, "09:59") }).allowed).toBe(
      false,
    );
    expect(computeAccess({ ...base, now: pkt(SUN, "12:00") }).allowed).toBe(
      false,
    );
  });

  it("blocks a holiday, unless a one-off window covers it", () => {
    const holiday = { ...base, holidays: [MON], now: pkt(MON, "12:00") };
    expect(computeAccess(holiday).allowed).toBe(false);
    const withWindow = computeAccess({
      ...holiday,
      windows: [
        {
          startsAt: pkt(MON, "11:00"),
          endsAt: pkt(MON, "15:00"),
          kind: "ONE_OFF",
        },
      ],
    });
    expect(withWindow).toMatchObject({ allowed: true, phase: "extra" });
    expect(withWindow.accessUntil?.toISOString()).toBe(
      pkt(MON, "15:00").toISOString(),
    );
  });

  it("chains extra time onto the end of grace", () => {
    const windows = [
      {
        startsAt: pkt(MON, "18:30"),
        endsAt: pkt(MON, "18:45"),
        kind: "EXTRA_TIME" as const,
      },
    ];
    const during = computeAccess({ ...base, windows, now: pkt(MON, "12:00") });
    expect(during.accessUntil?.toISOString()).toBe(
      pkt(MON, "18:45").toISOString(),
    );
    const inExtra = computeAccess({ ...base, windows, now: pkt(MON, "18:40") });
    expect(inExtra).toMatchObject({ allowed: true, phase: "extra" });
    expect(
      computeAccess({ ...base, windows, now: pkt(MON, "18:45") }).allowed,
    ).toBe(false);
  });

  it("works with no grace", () => {
    const s = computeAccess({
      ...base,
      graceMinutes: 0,
      now: pkt(MON, "17:00"),
    });
    expect(s.accessUntil?.toISOString()).toBe(pkt(MON, "18:00").toISOString());
    expect(
      computeAccess({ ...base, graceMinutes: 0, now: pkt(MON, "18:00") })
        .allowed,
    ).toBe(false);
  });

  it("handles early hours that fall on the previous UTC day", () => {
    const early = {
      ...base,
      weeklyHours: {
        ...emptyWeeklyHours(),
        mon: { start: "03:00", end: "06:00" },
      },
      graceMinutes: 0,
    };
    // 04:00 PKT Monday = 23:00 UTC Sunday.
    const s = computeAccess({ ...early, now: pkt(MON, "04:00") });
    expect(s.allowed).toBe(true);
    expect(s.accessUntil?.toISOString()).toBe(pkt(MON, "06:00").toISOString());
  });

  it("joins a one-off window that runs past midnight into the next day's hours", () => {
    const NEXT_MON = "2026-11-23";
    const s = computeAccess({
      ...base,
      windows: [
        {
          startsAt: pkt(SUN, "20:00"),
          endsAt: pkt(NEXT_MON, "10:00"),
          kind: "ONE_OFF",
        },
      ],
      now: pkt(SUN, "23:00"),
    });
    expect(s.accessUntil?.toISOString()).toBe(
      pkt(NEXT_MON, "18:30").toISOString(),
    );
  });
});

describe("isBuiltInPasskey", () => {
  it("counts only single-device platform passkeys", () => {
    expect(
      isBuiltInPasskey({ deviceType: "singleDevice", attachment: "platform" }),
    ).toBe(true);
    expect(
      isBuiltInPasskey({ deviceType: "multiDevice", attachment: "platform" }),
    ).toBe(false); // synced
    expect(
      isBuiltInPasskey({
        deviceType: "singleDevice",
        attachment: "cross-platform",
      }),
    ).toBe(false); // USB key
    expect(isBuiltInPasskey({ deviceType: null, attachment: null })).toBe(
      false,
    ); // unknown
  });
});

describe("decideRestriction", () => {
  const now = pkt(MON, "12:00");
  const open = computeAccess({ ...base, now });
  const closed = computeAccess({ ...base, now: pkt(SUN, "12:00") });
  const unrestricted = computeAccess({ ...base, hoursEnabled: false, now });
  const accessUntil = Math.floor(pkt(MON, "18:30").getTime() / 1000);

  it("refuses outside hours", () => {
    expect(
      decideRestriction({
        access: closed,
        requireDeviceBoundPasskey: false,
        passkeyExemptUntil: null,
        viaBuiltInPasskey: false,
        now,
      }),
    ).toEqual({ ok: false, code: "OUTSIDE_HOURS" });
  });

  it("puts the end of access in the claims", () => {
    expect(
      decideRestriction({
        access: open,
        requireDeviceBoundPasskey: false,
        passkeyExemptUntil: null,
        viaBuiltInPasskey: false,
        now,
      }),
    ).toEqual({ ok: true, claims: { accessUntil } });
  });

  it("needs a built-in passkey when the rule is on", () => {
    expect(
      decideRestriction({
        access: open,
        requireDeviceBoundPasskey: true,
        passkeyExemptUntil: null,
        viaBuiltInPasskey: false,
        now,
      }),
    ).toEqual({ ok: false, code: "PASSKEY_REQUIRED" });
    expect(
      decideRestriction({
        access: open,
        requireDeviceBoundPasskey: true,
        passkeyExemptUntil: null,
        viaBuiltInPasskey: true,
        now,
      }),
    ).toEqual({ ok: true, claims: { accessUntil, dbp: true } });
  });

  it("lets the passkey exception in, ending at the earlier of the two limits", () => {
    const exempt = pkt(MON, "14:00");
    expect(
      decideRestriction({
        access: open,
        requireDeviceBoundPasskey: true,
        passkeyExemptUntil: exempt,
        viaBuiltInPasskey: false,
        now,
      }),
    ).toEqual({
      ok: true,
      claims: { accessUntil: exempt.getTime() / 1000, pxe: true },
    });
    // No hours limit: the exception end alone.
    expect(
      decideRestriction({
        access: unrestricted,
        requireDeviceBoundPasskey: true,
        passkeyExemptUntil: exempt,
        viaBuiltInPasskey: false,
        now,
      }),
    ).toEqual({
      ok: true,
      claims: { accessUntil: exempt.getTime() / 1000, pxe: true },
    });
  });

  it("ignores an expired exception", () => {
    expect(
      decideRestriction({
        access: open,
        requireDeviceBoundPasskey: true,
        passkeyExemptUntil: pkt(MON, "11:00"),
        viaBuiltInPasskey: false,
        now,
      }),
    ).toEqual({ ok: false, code: "PASSKEY_REQUIRED" });
  });

  it("the passkey exception doesn't lift hours", () => {
    expect(
      decideRestriction({
        access: closed,
        requireDeviceBoundPasskey: true,
        passkeyExemptUntil: pkt(SUN, "20:00"),
        viaBuiltInPasskey: false,
        now: pkt(SUN, "12:00"),
      }),
    ).toEqual({ ok: false, code: "OUTSIDE_HOURS" });
  });

  it("adds nothing for an unrestricted passkey-free rule", () => {
    expect(
      decideRestriction({
        access: unrestricted,
        requireDeviceBoundPasskey: false,
        passkeyExemptUntil: null,
        viaBuiltInPasskey: false,
        now,
      }),
    ).toEqual({ ok: true, claims: {} });
  });
});
