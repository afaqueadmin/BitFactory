/**
 * POST /api/user/[id]/sign-out-everywhere
 *
 * Admin action: ends every session of one user, on every device (N-2). They
 * can sign in again straight away with their current credentials - use it
 * when an account may be in use by someone else, together with a password
 * reset if needed.
 *
 * Same tier rules as an admin password reset: an ADMIN can act on CLIENT and
 * FRANCHISEE accounts, a SUPER_ADMIN also on ADMIN accounts.
 */
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { sessionCutoffNow } from "@/lib/auth/sessionRevocation";

export const runtime = "nodejs";

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
      select: { role: true, email: true },
    });
    if (actor?.role !== "ADMIN" && actor?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can sign users out" },
        { status: 403 },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { role: true, email: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const targetIsAdminTier =
      target.role === "ADMIN" || target.role === "SUPER_ADMIN";
    const forbidden =
      (actor.role === "ADMIN" && targetIsAdminTier) ||
      (actor.role === "SUPER_ADMIN" && target.role === "SUPER_ADMIN");
    if (forbidden) {
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
          description: `All sessions of ${target.email} signed out by ${
            actor.role === "SUPER_ADMIN" ? "super admin" : "admin"
          } ${actor.email}`,
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
