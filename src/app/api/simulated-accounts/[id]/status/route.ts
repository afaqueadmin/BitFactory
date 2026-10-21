import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { sessionCutoffNow } from "@/lib/auth/sessionRevocation";
import { canManageAccount } from "@/lib/auth/accountTiers";
import { isReleasedEmail } from "@/lib/auth/emailIdentity";

export const runtime = "nodejs";

/**
 * POST /api/simulated-accounts/[id]/status  (ADMIN / SUPER_ADMIN / ACCOUNTING)
 * Body: { active: boolean }
 *
 * Simulated accounts are deactivated rather than deleted, so they stay in
 * the Simulated Accounts list (and its lead export). Inactive is stored as
 * the usual soft-delete flag (User.isDeleted), which already blocks sign-in
 * everywhere; deactivating also ends every session.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let actorId: string;
    try {
      actorId = (await verifyJwtToken(token)).userId;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Role from the database, not the token.
    const actor = await prisma.user.findFirst({
      where: { id: actorId, isDeleted: false },
      select: { role: true },
    });
    if (!actor || !isStaffRole(actor.role)) {
      return NextResponse.json(
        { error: "Only administrators can change simulated accounts" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body.active !== "boolean") {
      return NextResponse.json(
        { error: "active must be true or false" },
        { status: 400 },
      );
    }
    const active: boolean = body.active;

    const target = await prisma.user.findUnique({
      where: { id },
      select: { role: true, name: true, email: true, isDeleted: true },
    });
    if (!target || target.role !== "SIMULATED") {
      return NextResponse.json(
        { error: "Simulated account not found" },
        { status: 404 },
      );
    }
    if (!canManageAccount(actor.role, target.role)) {
      return NextResponse.json(
        { error: "You do not have permission to change this account" },
        { status: 403 },
      );
    }

    const label = target.name || target.email;
    const wasActive = !target.isDeleted;
    if (wasActive === active) {
      return NextResponse.json({
        message: `${label} is already ${active ? "active" : "inactive"}`,
      });
    }

    // Its email was taken over as another account's sign-in email.
    if (active && isReleasedEmail(target.email)) {
      return NextResponse.json(
        {
          error:
            "This account's email is now used by another account. A super admin must set a new email before it can be activated.",
        },
        { status: 400 },
      );
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: active
          ? { isDeleted: false }
          : { isDeleted: true, sessionsValidAfter: sessionCutoffNow() },
      }),
      prisma.auditLog.create({
        data: {
          action: AuditAction.USER_UPDATED,
          entityType: "User",
          entityId: id,
          userId: actorId,
          description: `Simulated account ${label} ${active ? "activated" : "deactivated"}`,
          changes: JSON.stringify({ active: { from: wasActive, to: active } }),
        },
      }),
    ]);

    return NextResponse.json({
      message: `${label} is now ${active ? "active" : "inactive"}`,
    });
  } catch (error) {
    console.error("[Simulated Account Status API] Error:", error);
    return NextResponse.json(
      { error: "Failed to change the account's status" },
      { status: 500 },
    );
  }
}
