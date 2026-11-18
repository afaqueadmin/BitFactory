/**
 * GET /api/admin/staff-access
 *
 * Everything the Access Rules page shows (SUPER_ADMIN only): each ADMIN and
 * ACCOUNTING account with its rule, live state, passkeys (built-in or not),
 * upcoming one-off windows and own days off; pending requests for more time;
 * office-wide holidays.
 */
import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/staffAccessAdmin";
import {
  RESTRICTABLE_ROLES,
  loadStaffAccess,
} from "@/lib/auth/staffAccessServer";
import {
  addDays,
  emptyWeeklyHours,
  isBuiltInPasskey,
  officeDate,
  parseWeeklyHours,
} from "@/lib/auth/staffAccess";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const actor = await requireSuperAdmin(request);
  if (actor instanceof NextResponse) return actor;

  try {
    const now = new Date();
    const fromDate = new Date(`${addDays(officeDate(now), -1)}T00:00:00Z`);

    const accounts = await prisma.user.findMany({
      where: {
        role: { in: [...RESTRICTABLE_ROLES] as Role[] },
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        staffAccessRule: true,
        webauthnCredentials: {
          select: {
            id: true,
            credentialName: true,
            deviceType: true,
            attachment: true,
            createdAt: true,
            lastUsedAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        staffAccessWindows: {
          where: { kind: "ONE_OFF", endsAt: { gt: now } },
          orderBy: { startsAt: "asc" },
          select: { id: true, startsAt: true, endsAt: true, note: true },
        },
        staffHolidays: {
          where: { date: { gte: fromDate } },
          orderBy: { date: "asc" },
          select: { id: true, date: true, name: true },
        },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    const rows = await Promise.all(
      accounts.map(async (a) => {
        const snapshot = a.staffAccessRule
          ? await loadStaffAccess(a.id, a.role, now)
          : null;
        const parsed = a.staffAccessRule
          ? parseWeeklyHours(a.staffAccessRule.weeklyHours)
          : null;
        return {
          id: a.id,
          name: a.name,
          email: a.email,
          role: a.role,
          rule: a.staffAccessRule
            ? {
                hoursEnabled: a.staffAccessRule.hoursEnabled,
                weeklyHours: parsed?.ok ? parsed.value : emptyWeeklyHours(),
                graceMinutes: a.staffAccessRule.graceMinutes,
                requireDeviceBoundPasskey:
                  a.staffAccessRule.requireDeviceBoundPasskey,
                passkeyExemptUntil: a.staffAccessRule.passkeyExemptUntil,
                passkeyExemptNote: a.staffAccessRule.passkeyExemptNote,
                updatedAt: a.staffAccessRule.updatedAt,
              }
            : null,
          live: snapshot
            ? {
                allowed: snapshot.access.allowed,
                phase: snapshot.access.phase,
                accessUntil: snapshot.access.accessUntil,
                scheduledEnd: snapshot.access.scheduledEnd,
                graceEnd: snapshot.access.graceEnd,
              }
            : null,
          passkeys: a.webauthnCredentials.map((c) => ({
            id: c.id,
            name: c.credentialName,
            builtIn: isBuiltInPasskey(c),
            // Null = not used since device details started being saved.
            known: c.deviceType !== null,
            deviceType: c.deviceType,
            attachment: c.attachment,
            createdAt: c.createdAt,
            lastUsedAt: c.lastUsedAt,
          })),
          windows: a.staffAccessWindows,
          holidays: a.staffHolidays.map((h) => ({
            id: h.id,
            date: h.date.toISOString().slice(0, 10),
            name: h.name,
          })),
        };
      }),
    );

    const [requests, officeHolidays] = await Promise.all([
      prisma.staffTimeRequest.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          minutesRequested: true,
          note: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.staffHoliday.findMany({
        where: { userId: null, date: { gte: fromDate } },
        orderBy: { date: "asc" },
        select: { id: true, date: true, name: true },
      }),
    ]);

    return NextResponse.json({
      accounts: rows,
      requests,
      officeHolidays: officeHolidays.map((h) => ({
        id: h.id,
        date: h.date.toISOString().slice(0, 10),
        name: h.name,
      })),
      serverNow: now.toISOString(),
    });
  } catch (error) {
    console.error("Staff access list error:", error);
    return NextResponse.json(
      { error: "Failed to load access rules" },
      { status: 500 },
    );
  }
}
