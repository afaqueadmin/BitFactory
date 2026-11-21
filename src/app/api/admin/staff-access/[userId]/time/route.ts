/**
 * POST /api/admin/staff-access/[userId]/time
 *   { minutes, requestId? }              add extra time (approving a request)
 *   { requestId, decline: true }         decline a request
 *
 * Live extra time (SUPER_ADMIN only): N minutes are added from the end of the
 * person's current allowed time, or from now if they are already outside it.
 * Their open session picks it up within 30 seconds and the banner shows
 * "N minutes extra time added".
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  label,
  loadTarget,
  requestMeta,
  staffAccessActor,
} from "@/lib/auth/staffAccessAdmin";
import { loadStaffAccess } from "@/lib/auth/staffAccessServer";

export const runtime = "nodejs";

const MAX_MINUTES = 480;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await authorizeStaff(request, ["access_rules.manage"]);
  if ("response" in auth) return auth.response;
  const actor = await staffAccessActor(auth.userId);
  const { userId } = await params;
  const target = await loadTarget(actor, userId);
  if (target instanceof NextResponse) return target;

  try {
    const body = await request.json().catch(() => ({}));
    const requestId =
      typeof body.requestId === "string" && body.requestId
        ? body.requestId
        : null;
    const meta = requestMeta(request);

    const pending = requestId
      ? await prisma.staffTimeRequest.findFirst({
          where: { id: requestId, userId, status: "PENDING" },
        })
      : null;
    if (requestId && !pending) {
      return NextResponse.json(
        { error: "That request was already handled or doesn't exist" },
        { status: 409 },
      );
    }

    if (body.decline === true) {
      if (!pending) {
        return NextResponse.json(
          { error: "requestId is required" },
          { status: 400 },
        );
      }
      await prisma.staffTimeRequest.update({
        where: { id: pending.id },
        data: {
          status: "DECLINED",
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      });
      return NextResponse.json({ message: "Request declined" });
    }

    const minutes = Number(body.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
      return NextResponse.json(
        { error: `Minutes must be 1 to ${MAX_MINUTES}` },
        { status: 400 },
      );
    }

    const now = new Date();
    const snapshot = await loadStaffAccess(userId, target.role, now);
    if (!snapshot?.hoursEnabled) {
      return NextResponse.json(
        {
          error:
            "This account has no working-hours limit, so it needs no extra time",
        },
        { status: 400 },
      );
    }
    // Continue from the end of the current allowed time, so the added
    // minutes really extend the session; otherwise start now.
    const current = snapshot.access.allowed
      ? snapshot.access.accessUntil
      : null;
    const startsAt = current && current > now ? current : now;
    const endsAt = new Date(startsAt.getTime() + minutes * 60_000);

    await prisma.$transaction([
      prisma.staffAccessWindow.create({
        data: {
          userId,
          startsAt,
          endsAt,
          kind: "EXTRA_TIME",
          note: pending ? `Request ${pending.id}` : null,
          createdById: actor.id,
        },
      }),
      ...(pending
        ? [
            prisma.staffTimeRequest.update({
              where: { id: pending.id },
              data: {
                status: "APPROVED",
                minutesGranted: minutes,
                decidedById: actor.id,
                decidedAt: now,
              },
            }),
          ]
        : []),
      prisma.auditLog.create({
        data: {
          action: AuditAction.STAFF_ACCESS_TIME_ADDED,
          entityType: "User",
          entityId: userId,
          userId: actor.id,
          description: `${minutes} minutes extra time for ${label(target)} (until ${endsAt.toISOString()}) added by super admin ${actor.email}${
            pending ? " on request" : ""
          }`,
          ...meta,
        },
      }),
    ]);

    return NextResponse.json({
      message: `${minutes} minutes added`,
      endsAt: endsAt.toISOString(),
    });
  } catch (error) {
    console.error("Staff access extra time error:", error);
    return NextResponse.json({ error: "Failed to add time" }, { status: 500 });
  }
}
