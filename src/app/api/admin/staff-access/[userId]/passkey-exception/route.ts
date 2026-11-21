/**
 * Emergency passkey exception (SUPER_ADMIN only): an account that must use its
 * office passkey may sign in without it - with password and 2FA, from any
 * device - until a set time, at most 7 days ahead. It doesn't lift the hours
 * limit (that is a separate hours exception). Sessions started under it end
 * at its end time (the end is folded into the session's accessUntil).
 *
 * POST   /api/admin/staff-access/[userId]/passkey-exception  { until, note? }
 * DELETE /api/admin/staff-access/[userId]/passkey-exception
 *        ends it early and signs the account out everywhere.
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
import { notifyAccount } from "@/lib/auth/staffAccessServer";
import {
  MAX_PASSKEY_EXEMPT_DAYS,
  OFFICE_TIME_ZONE,
} from "@/lib/auth/staffAccess";

export const runtime = "nodejs";

const officeTime = (d: Date) =>
  d.toLocaleString("en-GB", {
    timeZone: OFFICE_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });

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
    const until = new Date(body.until);
    const now = new Date();
    if (Number.isNaN(until.getTime()) || until <= now) {
      return NextResponse.json(
        { error: "The end time must be in the future" },
        { status: 400 },
      );
    }
    if (
      until.getTime() - now.getTime() >
      MAX_PASSKEY_EXEMPT_DAYS * 86_400_000
    ) {
      return NextResponse.json(
        {
          error: `A passkey exception can run at most ${MAX_PASSKEY_EXEMPT_DAYS} days ahead`,
        },
        { status: 400 },
      );
    }
    const rule = await prisma.staffAccessRule.findUnique({
      where: { userId },
      select: { requireDeviceBoundPasskey: true },
    });
    if (!rule?.requireDeviceBoundPasskey) {
      return NextResponse.json(
        {
          error:
            "This account doesn't need the office passkey, so it needs no exception",
        },
        { status: 400 },
      );
    }
    const note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim().slice(0, 500)
        : null;

    await prisma.$transaction([
      prisma.staffAccessRule.update({
        where: { userId },
        data: {
          passkeyExemptUntil: until,
          passkeyExemptNote: note,
          updatedById: actor.id,
        },
      }),
      prisma.auditLog.create({
        data: {
          action: AuditAction.STAFF_ACCESS_EXCEPTION_SET,
          entityType: "User",
          entityId: userId,
          userId: actor.id,
          description: `Passkey exception for ${label(target)} until ${until.toISOString()}, set by super admin ${actor.email}`,
          changes: JSON.stringify({ kind: "PASSKEY", until, note }),
          ...requestMeta(request),
        },
      }),
    ]);

    notifyAccount(
      target.email,
      {
        subject: "Sign-In Without Office Passkey Allowed",
        heading: "Temporary sign-in without your office passkey",
        message: `A super admin has allowed your BitFactory account to sign in without the passkey on your office computer until ${officeTime(until)} (office time). Use your password and two-factor code. Your working hours still apply. If you didn't ask for this, tell a super admin.`,
      },
      request.headers,
    );

    return NextResponse.json({ message: `Allowed until ${officeTime(until)}` });
  } catch (error) {
    console.error("Passkey exception error:", error);
    return NextResponse.json(
      { error: "Failed to set the exception" },
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
    const rule = await prisma.staffAccessRule.findUnique({
      where: { userId },
      select: { passkeyExemptUntil: true },
    });
    if (!rule?.passkeyExemptUntil) {
      return NextResponse.json(
        { error: "No exception is set" },
        { status: 404 },
      );
    }
    const now = new Date();
    await prisma.$transaction([
      prisma.staffAccessRule.update({
        where: { userId },
        data: {
          passkeyExemptUntil: null,
          passkeyExemptNote: null,
          updatedById: actor.id,
        },
      }),
      // Sessions started under the exception end now.
      prisma.user.update({
        where: { id: userId },
        data: { sessionsValidAfter: sessionCutoffNow() },
      }),
      prisma.userSession.updateMany({
        where: { userId, logoutAt: null },
        data: { logoutAt: now },
      }),
      prisma.auditLog.create({
        data: {
          action: AuditAction.STAFF_ACCESS_EXCEPTION_SET,
          entityType: "User",
          entityId: userId,
          userId: actor.id,
          description: `Passkey exception for ${label(target)} ended early by super admin ${actor.email}; signed out everywhere`,
          ...requestMeta(request),
        },
      }),
    ]);
    return NextResponse.json({
      message: "Exception ended. They have been signed out.",
    });
  } catch (error) {
    console.error("Passkey exception clear error:", error);
    return NextResponse.json(
      { error: "Failed to end the exception" },
      { status: 500 },
    );
  }
}
