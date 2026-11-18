/**
 * PUT /api/admin/staff-access/[userId]
 *   { hoursEnabled, weeklyHours, graceMinutes, requireDeviceBoundPasskey }
 *
 * Saves an ADMIN/ACCOUNTING account's access rule (SUPER_ADMIN only).
 * Turning the passkey rule on needs at least one built-in passkey on the
 * account (registered on the office PC beforehand), and signs the account out
 * everywhere so no session without that passkey survives. Hours changes
 * don't sign anyone out: open sessions pick them up within 30 seconds
 * (GET /api/user/access-window).
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
import { isBuiltInPasskey, parseWeeklyHours } from "@/lib/auth/staffAccess";

export const runtime = "nodejs";

const MAX_GRACE_MINUTES = 240;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actor = await requireSuperAdmin(request);
  if (actor instanceof NextResponse) return actor;
  const { userId } = await params;
  const target = await loadTarget(actor, userId);
  if (target instanceof NextResponse) return target;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }
    const hoursEnabled = body.hoursEnabled === true;
    const requireDeviceBoundPasskey = body.requireDeviceBoundPasskey === true;
    const graceMinutes = Number(body.graceMinutes ?? 0);
    if (
      !Number.isInteger(graceMinutes) ||
      graceMinutes < 0 ||
      graceMinutes > MAX_GRACE_MINUTES
    ) {
      return NextResponse.json(
        { error: `Grace must be 0 to ${MAX_GRACE_MINUTES} minutes` },
        { status: 400 },
      );
    }
    const hours = parseWeeklyHours(body.weeklyHours);
    if (!hours.ok) {
      return NextResponse.json({ error: hours.error }, { status: 400 });
    }
    if (hoursEnabled && Object.values(hours.value).every((d) => d === null)) {
      return NextResponse.json(
        {
          error: "Set hours for at least one day, or turn the hours limit off",
        },
        { status: 400 },
      );
    }

    const existing = await prisma.staffAccessRule.findUnique({
      where: { userId },
    });
    const turningPasskeyOn =
      requireDeviceBoundPasskey && !existing?.requireDeviceBoundPasskey;

    if (turningPasskeyOn) {
      const passkeys = await prisma.webAuthnCredential.findMany({
        where: { userId },
        select: { deviceType: true, attachment: true },
      });
      if (!passkeys.some(isBuiltInPasskey)) {
        return NextResponse.json(
          {
            error:
              "This account has no passkey built into an office computer yet. Have them sign in on the office PC and add a passkey there (Windows Hello), then sign in once with it, before turning this on.",
            code: "NO_BUILT_IN_PASSKEY",
          },
          { status: 400 },
        );
      }
    }

    const data = {
      hoursEnabled,
      weeklyHours: hours.value,
      graceMinutes,
      requireDeviceBoundPasskey,
      updatedById: actor.id,
    };
    const meta = requestMeta(request);
    const now = new Date();

    await prisma.$transaction([
      prisma.staffAccessRule.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      }),
      ...(turningPasskeyOn
        ? [
            prisma.user.update({
              where: { id: userId },
              data: { sessionsValidAfter: sessionCutoffNow() },
            }),
            prisma.userSession.updateMany({
              where: { userId, logoutAt: null },
              data: { logoutAt: now },
            }),
          ]
        : []),
      prisma.auditLog.create({
        data: {
          action: AuditAction.STAFF_ACCESS_RULE_UPDATED,
          entityType: "User",
          entityId: userId,
          userId: actor.id,
          description: `Access rules of ${label(target)} updated by super admin ${actor.email}${
            turningPasskeyOn
              ? " (office passkey now required; signed out everywhere)"
              : ""
          }`,
          changes: JSON.stringify({
            from: existing
              ? {
                  hoursEnabled: existing.hoursEnabled,
                  weeklyHours: existing.weeklyHours,
                  graceMinutes: existing.graceMinutes,
                  requireDeviceBoundPasskey: existing.requireDeviceBoundPasskey,
                }
              : null,
            to: {
              hoursEnabled,
              weeklyHours: hours.value,
              graceMinutes,
              requireDeviceBoundPasskey,
            },
          }),
          ...meta,
        },
      }),
    ]);

    return NextResponse.json({
      message: turningPasskeyOn
        ? `Saved. ${label(target)} has been signed out and must now use the office passkey.`
        : "Access rules saved",
    });
  } catch (error) {
    console.error("Staff access rule save error:", error);
    return NextResponse.json(
      { error: "Failed to save access rules" },
      { status: 500 },
    );
  }
}
