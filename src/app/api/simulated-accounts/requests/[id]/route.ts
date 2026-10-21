import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { canManageAccount } from "@/lib/auth/accountTiers";
import { sendSimulatedAccountReadyEmail } from "@/lib/email";
import {
  SIM_REQUEST_DECLINED_ACTIVITY,
  SimConversionError,
  convertToSimulated,
  simulationRequestStatus,
} from "@/lib/simulation/convert";

export const runtime = "nodejs";

/**
 * POST /api/simulated-accounts/requests/[id]  (ADMIN / SUPER_ADMIN /
 * ACCOUNTING)
 * Body: { action: "approve" | "decline" }   [id] = the requesting customer
 *
 * approve: converts that same account into a simulated account (same rules
 *          as Change to Simulated Account) and emails them that it's ready.
 * decline: closes the request; they can ask again later.
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
        { error: "Only administrators can review simulation requests" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action;
    if (action !== "approve" && action !== "decline") {
      return NextResponse.json(
        { error: 'action must be "approve" or "decline"' },
        { status: 400 },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { role: true, name: true, email: true },
    });
    if (!target || (await simulationRequestStatus(id)) !== "pending") {
      return NextResponse.json(
        { error: "No open simulation request for this customer" },
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

    if (action === "decline") {
      await prisma.$transaction([
        prisma.userActivity.create({
          data: {
            userId: id,
            type: SIM_REQUEST_DECLINED_ACTIVITY,
            ipAddress:
              request.headers.get("x-forwarded-for") ||
              request.headers.get("x-real-ip") ||
              "unknown",
            userAgent: request.headers.get("user-agent") || "unknown",
          },
        }),
        prisma.auditLog.create({
          data: {
            action: AuditAction.USER_UPDATED,
            entityType: "User",
            entityId: id,
            userId: actorId,
            description: `Simulated account request from ${label} declined`,
          },
        }),
      ]);
      return NextResponse.json({
        message: `Declined the request from ${label}`,
      });
    }

    let converted;
    try {
      converted = await convertToSimulated(id, actorId);
    } catch (error) {
      if (error instanceof SimConversionError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    // The account is converted either way; a failed email is only reported.
    const sent = await sendSimulatedAccountReadyEmail(
      converted.email,
      converted.name,
    );
    return NextResponse.json({
      message: sent.success
        ? `${converted.label} is now a simulated account and has been emailed.`
        : `${converted.label} is now a simulated account, but the notification email failed to send.`,
    });
  } catch (error) {
    console.error("[Simulation Requests API] Error:", error);
    return NextResponse.json(
      { error: "Failed to review the request" },
      { status: 500 },
    );
  }
}
