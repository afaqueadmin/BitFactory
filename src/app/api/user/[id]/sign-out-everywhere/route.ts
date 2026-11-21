/**
 * POST /api/user/[id]/sign-out-everywhere
 *
 * Admin action: ends every session of one user, on every device (N-2). They
 * can sign in again straight away with their current credentials - use it
 * when an account may be in use by someone else, together with a password
 * reset if needed.
 *
 * Same tier rules as an admin password reset: an ADMIN or ACCOUNTING user can
 * act on CLIENT and FRANCHISEE accounts, a SUPER_ADMIN also on ADMIN and
 * ACCOUNTING accounts.
 */
import { staffActorLabel } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionCutoffNow } from "@/lib/auth/sessionRevocation";
import { canManageAccount } from "@/lib/auth/accountTiers";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeStaff(request, ["customers.sign_out"]);
    if ("response" in auth) return auth.response;
    const actorId = auth.userId;
    const actor = await prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { role: true, email: true },
    });

    const target = await prisma.user.findUnique({
      where: { id },
      select: { role: true, email: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!canManageAccount(actor.role, target.role)) {
      return NextResponse.json(
        { error: "You do not have permission to sign this user out" },
        { status: 403 },
      );
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { sessionsValidAfter: sessionCutoffNow() },
      }),
      // Session history: every open session ends now.
      prisma.userSession.updateMany({
        where: { userId: id, logoutAt: null },
        data: { logoutAt: now },
      }),
      prisma.auditLog.create({
        data: {
          action: AuditAction.USER_SESSIONS_REVOKED,
          entityType: "User",
          entityId: id,
          userId: actorId,
          description: `All sessions of ${target.email} signed out by ${staffActorLabel(
            actor.role,
          )} ${actor.email}`,
          ipAddress: request.headers.get("x-forwarded-for") || "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
        },
      }),
    ]);

    return NextResponse.json({
      message: `${target.email} has been signed out on all devices`,
    });
  } catch (error) {
    console.error("Sign out everywhere error:", error);
    return NextResponse.json(
      { error: "Failed to sign the user out" },
      { status: 500 },
    );
  }
}
