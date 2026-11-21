/**
 * POST /api/tickets/[id]/assign
 *
 * SUPER_ADMIN-only: assign a ticket to a specific staff user, or
 * pass assignedToId: null to unassign back to the shared queue. Any
 * ADMIN/SUPER_ADMIN/ACCOUNTING can still act on unassigned (or someone else's
 * assigned) tickets - assignment is ownership bookkeeping, not an access
 * restriction.
 */

import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationContext,
  requirePermission,
} from "@/lib/auth/authorization";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "tickets.assign");
    if (denied) return denied;

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
      if (!assignee || !isStaffRole(assignee.role)) {
        return NextResponse.json(
          {
            success: false,
            error: "assignedToId must be a staff user",
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
          userId: ctx.userId,
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
