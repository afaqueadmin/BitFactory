import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { sessionCutoffNow } from "@/lib/auth/sessionRevocation";
import { canManageAccount } from "@/lib/auth/accountTiers";

export const runtime = "nodejs";

/**
 * POST /api/simulated-accounts/[id]/convert  (ADMIN / SUPER_ADMIN)
 *
 * Turns a demo account into a real client: role CLIENT, segment Potential
 * Customer, same login. Its sessions are ended so no token issued under the
 * demo role keeps working. Subaccounts, miners and billing are then set up
 * through the normal Edit Customer flow.
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
    if (actor?.role !== "ADMIN" && actor?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can convert demo accounts" },
        { status: 403 },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { role: true, name: true, email: true, isDeleted: true },
    });
    if (!target || target.isDeleted || target.role !== "SIMULATED") {
      return NextResponse.json(
        { error: "Demo account not found" },
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
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          role: "CLIENT",
          segment: "POTENTIAL_CUSTOMER",
          sessionsValidAfter: sessionCutoffNow(),
        },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.USER_UPDATED,
          entityType: "User",
          entityId: id,
          userId: actorId,
          description: `Demo account ${label} converted to a customer`,
          changes: JSON.stringify({
            role: { from: "SIMULATED", to: "CLIENT" },
            segment: { from: null, to: "POTENTIAL_CUSTOMER" },
          }),
        },
      });
    });

    return NextResponse.json({
      message: `${label} is now a customer (Potential Customer). Assign subaccounts from Edit Customer.`,
    });
  } catch (error) {
    console.error("[Simulated Accounts Convert API] Error:", error);
    return NextResponse.json(
      { error: "Failed to convert demo account" },
      { status: 500 },
    );
  }
}
