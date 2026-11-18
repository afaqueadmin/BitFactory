/**
 * Holidays for accounts with working hours (SUPER_ADMIN only). On a holiday
 * the scheduled hours don't apply - the account is blocked all day unless a
 * one-off window (hours exception) covers it.
 *
 * POST   /api/admin/staff-access/holidays   { date: "YYYY-MM-DD", name, userId? }
 *        no userId = office-wide; with userId = that account's own day off
 * DELETE /api/admin/staff-access/holidays?id=<holidayId>
 */
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  label,
  loadTarget,
  requestMeta,
  requireSuperAdmin,
} from "@/lib/auth/staffAccessAdmin";

export const runtime = "nodejs";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const actor = await requireSuperAdmin(request);
  if (actor instanceof NextResponse) return actor;

  try {
    const body = await request.json().catch(() => ({}));
    const date = typeof body.date === "string" ? body.date : "";
    const asDate = new Date(`${date}T00:00:00Z`);
    if (
      !YMD.test(date) ||
      Number.isNaN(asDate.getTime()) ||
      asDate.toISOString().slice(0, 10) !== date
    ) {
      return NextResponse.json(
        { error: "A valid date is required" },
        { status: 400 },
      );
    }
    const name =
      typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) {
      return NextResponse.json(
        { error: "A name is required" },
        { status: 400 },
      );
    }

    let userId: string | null = null;
    let who = "the whole office";
    if (typeof body.userId === "string" && body.userId) {
      const target = await loadTarget(actor, body.userId);
      if (target instanceof NextResponse) return target;
      userId = target.id;
      who = label(target);
    }

    // Postgres treats NULLs as distinct, so office-wide duplicates are
    // checked here (and by the partial unique index).
    const duplicate = await prisma.staffHoliday.findFirst({
      where: { date: asDate, userId },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "That day is already set as a holiday" },
        { status: 409 },
      );
    }

    const [holiday] = await prisma.$transaction([
      prisma.staffHoliday.create({
        data: { date: asDate, name, userId, createdById: actor.id },
        select: { id: true, name: true },
      }),
      prisma.auditLog.create({
        data: {
          action: AuditAction.STAFF_HOLIDAY_UPDATED,
          entityType: "StaffHoliday",
          entityId: userId ?? "office",
          userId: actor.id,
          description: `Holiday ${date} "${name}" added for ${who} by super admin ${actor.email}`,
          ...requestMeta(request),
        },
      }),
    ]);
    return NextResponse.json(
      { holiday: { ...holiday, date } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Staff holiday create error:", error);
    return NextResponse.json(
      { error: "Failed to add the holiday" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await requireSuperAdmin(request);
  if (actor instanceof NextResponse) return actor;

  try {
    const id = new URL(request.url).searchParams.get("id");
    const holiday = id
      ? await prisma.staffHoliday.findUnique({
          where: { id },
          select: {
            id: true,
            date: true,
            name: true,
            userId: true,
            user: { select: { email: true, name: true } },
          },
        })
      : null;
    if (!holiday) {
      return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
    }
    const who = holiday.user ? label(holiday.user) : "the whole office";
    const date = holiday.date.toISOString().slice(0, 10);
    await prisma.$transaction([
      prisma.staffHoliday.delete({ where: { id: holiday.id } }),
      prisma.auditLog.create({
        data: {
          action: AuditAction.STAFF_HOLIDAY_UPDATED,
          entityType: "StaffHoliday",
          entityId: holiday.userId ?? "office",
          userId: actor.id,
          description: `Holiday ${date} "${holiday.name}" removed for ${who} by super admin ${actor.email}`,
          ...requestMeta(request),
        },
      }),
    ]);
    return NextResponse.json({ message: "Holiday removed" });
  } catch (error) {
    console.error("Staff holiday delete error:", error);
    return NextResponse.json(
      { error: "Failed to remove the holiday" },
      { status: 500 },
    );
  }
}
