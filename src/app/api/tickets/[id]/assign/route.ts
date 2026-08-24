/**
 * POST /api/tickets/[id]/assign
 *
 * SUPER_ADMIN-only: assign a ticket to a specific ADMIN/SUPER_ADMIN user, or
 * pass assignedToId: null to unassign back to the shared queue. Any
 * ADMIN/SUPER_ADMIN can still act on unassigned (or someone else's
 * assigned) tickets - assignment is ownership bookkeeping, not an access
 * restriction.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    if (decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Only a super admin can assign tickets" },
        { status: 403 },
      );
    }

    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket not found" },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { assignedToId } = body as { assignedToId?: string | null };

    if (assignedToId) {
      const assignee = await prisma.user.findUnique({
        where: { id: assignedToId },
        select: { id: true, role: true },
      });
      if (
        !assignee ||
        (assignee.role !== "ADMIN" && assignee.role !== "SUPER_ADMIN")
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "assignedToId must be an ADMIN or SUPER_ADMIN user",
          },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.supportTicket.update({
        where: { id },
        data: { assignedToId: assignedToId || null },
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.TICKET_ASSIGNED,
          entityType: "SupportTicket",
          entityId: id,
          userId: decoded.userId,
          description: assignedToId
            ? `Ticket "${ticket.subject}" assigned to ${result.assignedTo?.name || result.assignedTo?.email}`
            : `Ticket "${ticket.subject}" unassigned`,
        },
      });

      return result;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Ticket Assign API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to assign ticket" },
      { status: 500 },
    );
  }
}
