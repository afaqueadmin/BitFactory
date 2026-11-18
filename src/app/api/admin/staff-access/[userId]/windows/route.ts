/**
 * Hours exception (SUPER_ADMIN only): a one-off window in which the account
 * may sign in and work outside its weekly hours - also on a holiday.
 *
 * POST   /api/admin/staff-access/[userId]/windows   { startsAt, endsAt, note? }
 *        (ISO date-times; "allow now for N hours" sends startsAt = now)
 * DELETE /api/admin/staff-access/[userId]/windows?id=<windowId>
 *
 * Removing a window that is in use signs the account out everywhere.
 */
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionCutoffNow } from "@/lib/auth/sessionRevocation";
import {
  label,
  loadTarget,
  requestMeta,
  requireSuperAdmin,
} from "@/lib/auth/staffAccessAdmin";

export const runtime = "nodejs";

const MAX_WINDOW_DAYS = 31;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actor = await requireSuperAdmin(request);
  if (actor instanceof NextResponse) return actor;
  const { userId } = await params;
  const target = await loadTarget(actor, userId);
  if (target instanceof NextResponse) return target;

  try {
    const body = await request.json().catch(() => ({}));
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    const now = new Date();
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return NextResponse.json(
        { error: "Start and end are required" },
        { status: 400 },
      );
    }
    if (endsAt <= startsAt) {
      return NextResponse.json(
        { error: "End must be after start" },
        { status: 400 },
      );
    }
    if (endsAt <= now) {
      return NextResponse.json(
        { error: "End must be in the future" },
        { status: 400 },
      );
    }
    if (endsAt.getTime() - startsAt.getTime() > MAX_WINDOW_DAYS * 86_400_000) {
      return NextResponse.json(
        { error: `A window can be at most ${MAX_WINDOW_DAYS} days long` },
        { status: 400 },
      );
    }
    const rule = await prisma.staffAccessRule.findUnique({
      where: { userId },
      select: { hoursEnabled: true },
    });
    if (!rule?.hoursEnabled) {
      return NextResponse.json(
        {
          error:
            "This account has no working-hours limit, so it needs no exception",
        },
        { status: 400 },
      );
    }
    const note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim().slice(0, 500)
        : null;

    const [window] = await prisma.$transaction([
      prisma.staffAccessWindow.create({
        data: {
          userId,
          startsAt,
          endsAt,
          kind: "ONE_OFF",
          note,
          createdById: actor.id,
        },
        select: { id: true, startsAt: true, endsAt: true, note: true },
      }),
      prisma.auditLog.create({
        data: {
          action: AuditAction.STAFF_ACCESS_EXCEPTION_SET,
          entityType: "User",
          entityId: userId,
          userId: actor.id,
          description: `Hours exception for ${label(target)}: ${startsAt.toISOString()} to ${endsAt.toISOString()}, set by super admin ${actor.email}`,
          changes: JSON.stringify({ kind: "ONE_OFF", startsAt, endsAt, note }),
          ...requestMeta(request),
        },
      }),
    ]);
    return NextResponse.json({ window }, { status: 201 });
  } catch (error) {
    console.error("Staff access window create error:", error);
    return NextResponse.json(
      { error: "Failed to save the exception" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actor = await requireSuperAdmin(request);
  if (actor instanceof NextResponse) return actor;
  const { userId } = await params;
  const target = await loadTarget(actor, userId);
  if (target instanceof NextResponse) return target;

  try {
    const id = new URL(request.url).searchParams.get("id");
    const window = id
      ? await prisma.staffAccessWindow.findFirst({
          where: { id, userId, kind: "ONE_OFF" },
        })
      : null;
    if (!window) {
      return NextResponse.json(
        { error: "Exception not found" },
        { status: 404 },
      );
    }
    // A window in use right now: end the sessions it allowed at once (they
    // carry its end time). Sessions in normal hours just sign in again.
    const now = new Date();
    const inUse = window.startsAt <= now && now < window.endsAt;
    await prisma.$transaction([
      prisma.staffAccessWindow.delete({ where: { id: window.id } }),
      ...(inUse
        ? [
            prisma.user.update({
              where: { id: userId },
              data: { sessionsValidAfter: sessionCutoffNow() },
            }),
          ]
        : []),
      prisma.auditLog.create({
        data: {
          action: AuditAction.STAFF_ACCESS_EXCEPTION_SET,
          entityType: "User",
          entityId: userId,
          userId: actor.id,
          description: `Hours exception for ${label(target)} (${window.startsAt.toISOString()} to ${window.endsAt.toISOString()}) removed by super admin ${actor.email}`,
          ...requestMeta(request),
        },
      }),
    ]);
    return NextResponse.json({ message: "Exception removed" });
  } catch (error) {
    console.error("Staff access window delete error:", error);
    return NextResponse.json(
      { error: "Failed to remove the exception" },
      { status: 500 },
    );
  }
}
