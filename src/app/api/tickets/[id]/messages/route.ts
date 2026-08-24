/**
 * POST /api/tickets/[id]/messages
 *
 * Reply to a ticket. isInternal notes (hidden from the CLIENT who raised the
 * ticket) can only be posted by ADMIN/SUPER_ADMIN/FRANCHISEE - a CLIENT's
 * own replies are always customer-facing. Replying to a CLOSED ticket
 * reopens it (back to OPEN) unless the replier is the one closing it via
 * PATCH, which is a separate action.
 *
 * Auto status transitions are based on which side of the conversation the
 * reply comes from, not a fixed role list - because a FRANCHISEE plays
 * both sides depending on the ticket: support staff on a client's ticket,
 * but the customer on their own personal-account ticket.
 *
 * The ticket's "customer side" is whoever the ticket concerns: the
 * onBehalfOf client if one is set, otherwise whoever raised it. Everyone
 * else with access (ADMIN/SUPER_ADMIN always; a FRANCHISEE only when the
 * ticket isn't theirs) is the "support side".
 *
 * - A customer-facing reply from the support side on an OPEN/IN_PROGRESS
 *   ticket auto-advances status to WAITING_ON_CUSTOMER - support has said
 *   their piece, the ball is now in the customer's court. An internal note
 *   never triggers this (the customer never sees it).
 * - A reply from the customer side on a WAITING_ON_CUSTOMER ticket
 *   auto-reverts status to OPEN - the ball is back in support's court.
 * - Replying to a CLOSED ticket always reopens it (back to OPEN),
 *   regardless of which side replied.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { assertCanAccessTicket } from "@/lib/ticketScope";

async function requireUser(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 as const };
  try {
    const decoded = await verifyJwtToken(token);
    return { decoded };
  } catch {
    return { error: "Invalid token", status: 401 as const };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const { id } = await params;
    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket not found" },
        { status: 404 },
      );
    }

    const canAccess = await assertCanAccessTicket(auth.decoded, ticket);
    if (!canAccess) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { message, isInternal, attachmentUrl, attachmentPublicId } = body as {
      message?: string;
      isInternal?: boolean;
      attachmentUrl?: string;
      attachmentPublicId?: string;
    };

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { success: false, error: "Message body is required" },
        { status: 400 },
      );
    }
    if (message.length > 5000) {
      return NextResponse.json(
        { success: false, error: "Message must not exceed 5000 characters" },
        { status: 400 },
      );
    }

    const staffRole =
      auth.decoded.role === "ADMIN" ||
      auth.decoded.role === "SUPER_ADMIN" ||
      auth.decoded.role === "FRANCHISEE";

    const created = await prisma.$transaction(async (tx) => {
      const msg = await tx.ticketMessage.create({
        data: {
          ticketId: id,
          authorId: auth.decoded.userId,
          body: message.trim(),
          isInternal: staffRole && isInternal === true,
          attachmentUrl:
            typeof attachmentUrl === "string" && attachmentUrl.trim()
              ? attachmentUrl.trim()
              : null,
          attachmentPublicId:
            typeof attachmentPublicId === "string" && attachmentPublicId.trim()
              ? attachmentPublicId.trim()
              : null,
        },
        include: {
          author: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      // Which side of the conversation this reply is from - see the
      // module doc comment for why this can't just be a role check.
      const customerSideUserId = ticket.onBehalfOfUserId || ticket.raisedById;
      const isCustomerSide = auth.decoded.userId === customerSideUserId;
      const isSupportSideReply =
        !isCustomerSide &&
        (auth.decoded.role === "ADMIN" ||
          auth.decoded.role === "SUPER_ADMIN" ||
          auth.decoded.role === "FRANCHISEE") &&
        !msg.isInternal;

      if (ticket.status === "CLOSED") {
        await tx.supportTicket.update({
          where: { id },
          data: { status: "OPEN", closedAt: null },
        });
      } else if (
        isSupportSideReply &&
        (ticket.status === "OPEN" || ticket.status === "IN_PROGRESS")
      ) {
        await tx.supportTicket.update({
          where: { id },
          data: { status: "WAITING_ON_CUSTOMER" },
        });
      } else if (isCustomerSide && ticket.status === "WAITING_ON_CUSTOMER") {
        await tx.supportTicket.update({
          where: { id },
          data: { status: "OPEN" },
        });
      } else {
        await tx.supportTicket.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          action: AuditAction.TICKET_REPLIED,
          entityType: "SupportTicket",
          entityId: id,
          userId: auth.decoded.userId,
          description: `Reply added to ticket "${ticket.subject}"${msg.isInternal ? " (internal)" : ""}`,
        },
      });

      return msg;
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[Ticket Messages API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add message" },
      { status: 500 },
    );
  }
}
