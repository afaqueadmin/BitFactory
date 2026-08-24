/**
 * /api/tickets/[id]
 *
 * GET: ticket detail + its message thread. isInternal messages are stripped
 * out for a CLIENT viewer - "internal" means hidden from the end customer,
 * visible to ADMIN/SUPER_ADMIN/FRANCHISEE. priority is stripped out too -
 * it's a support/triage concept the client never sees, same as the create
 * flow in POST /api/tickets.
 *
 * PATCH: change status and/or priority (either or both, in one request).
 * CLIENT may only close their own ticket (self-service "I fixed it") and
 * can never touch priority; ADMIN/SUPER_ADMIN/FRANCHISEE (when it's their
 * franchise's ticket) may set any status and set priority.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import {
  assertCanAccessTicket,
  stripPriorityForClient,
} from "@/lib/ticketScope";

const STATUSES = new Set([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "RESOLVED",
  "CLOSED",
]);
const PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);

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

export async function GET(
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
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: {
        raisedBy: { select: { id: true, name: true, email: true, role: true } },
        onBehalfOf: { select: { id: true, name: true, email: true } },
        franchise: { select: { id: true, businessName: true } },
        miner: { select: { id: true, name: true, serialNumber: true } },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            status: true,
          },
        },
        assignedTo: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
      },
    });

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

    if (auth.decoded.role === "CLIENT") {
      const messages = ticket.messages.filter((m) => !m.isInternal);
      return NextResponse.json({
        success: true,
        data: stripPriorityForClient({ ...ticket, messages }),
      });
    }

    return NextResponse.json({ success: true, data: ticket });
  } catch (error) {
    console.error("[Ticket Detail API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch ticket" },
      { status: 500 },
    );
  }
}

export async function PATCH(
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
    const { status, priority } = body as { status?: string; priority?: string };

    if (status === undefined && priority === undefined) {
      return NextResponse.json(
        { success: false, error: "status and/or priority is required" },
        { status: 400 },
      );
    }

    if (status !== undefined && !STATUSES.has(status)) {
      return NextResponse.json(
        {
          success: false,
          error: `status must be one of: ${[...STATUSES].join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (
      status !== undefined &&
      auth.decoded.role === "CLIENT" &&
      status !== "CLOSED"
    ) {
      return NextResponse.json(
        { success: false, error: "You can only close your own ticket" },
        { status: 403 },
      );
    }

    // Priority is a support/triage concept - a CLIENT never sets it, same
    // restriction as ticket creation.
    if (priority !== undefined) {
      if (auth.decoded.role === "CLIENT") {
        return NextResponse.json(
          {
            success: false,
            error: "Only support staff can set ticket priority",
          },
          { status: 403 },
        );
      }
      if (!PRIORITIES.has(priority)) {
        return NextResponse.json(
          {
            success: false,
            error: `priority must be one of: ${[...PRIORITIES].join(", ")}`,
          },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.supportTicket.update({
        where: { id },
        data: {
          ...(status !== undefined
            ? {
                status: status as
                  | "OPEN"
                  | "IN_PROGRESS"
                  | "WAITING_ON_CUSTOMER"
                  | "RESOLVED"
                  | "CLOSED",
                closedAt: status === "CLOSED" ? new Date() : ticket.closedAt,
              }
            : {}),
          ...(priority !== undefined
            ? { priority: priority as "LOW" | "NORMAL" | "HIGH" | "URGENT" }
            : {}),
        },
      });

      if (status !== undefined) {
        await tx.auditLog.create({
          data: {
            action:
              status === "CLOSED"
                ? AuditAction.TICKET_CLOSED
                : AuditAction.TICKET_STATUS_CHANGED,
            entityType: "SupportTicket",
            entityId: id,
            userId: auth.decoded.userId,
            description: `Ticket "${ticket.subject}" status changed ${ticket.status} -> ${status}`,
          },
        });
      }

      if (priority !== undefined) {
        await tx.auditLog.create({
          data: {
            action: AuditAction.TICKET_PRIORITY_CHANGED,
            entityType: "SupportTicket",
            entityId: id,
            userId: auth.decoded.userId,
            description: `Ticket "${ticket.subject}" priority changed ${ticket.priority} -> ${priority}`,
          },
        });
      }

      return result;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Ticket Detail API] PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update ticket" },
      { status: 500 },
    );
  }
}
