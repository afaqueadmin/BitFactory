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
 * CLIENT may only close their own ticket (self-service "I fixed it").
 * FRANCHISEE cannot change status at all (raise/reply only) or priority.
 * ADMIN/SUPER_ADMIN may set any status and set priority.
 *
 * Resolving/closing a HARDWARE_MINER or POOL_HASHRATE ticket requires its
 * linked miner (mandatory on these categories since creation - see
 * POST /api/tickets) to be set to Miner.status "AUTO" - the admin-controlled
 * deployment/maintenance flag, not the live pool ACTIVE/INACTIVE status.
 * The idea: don't let a ticket about a broken machine get marked done while
 * that machine is still flagged UNDER_MAINTENANCE/DEPLOYMENT_IN_PROGRESS.
 * On a successful RESOLVED/CLOSED transition for these categories, a fresh
 * live telemetry snapshot is attached the same way as at ticket creation.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import {
  assertCanAccessTicket,
  stripPriorityForClient,
} from "@/lib/ticketScope";
import { getLiveMinerTelemetry } from "@/lib/ticketTelemetry";

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
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: { miner: { select: { id: true, status: true } } },
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

    // Franchisees can raise and reply to tickets, but never manually change
    // status - that's a support/admin decision.
    if (status !== undefined && auth.decoded.role === "FRANCHISEE") {
      return NextResponse.json(
        { success: false, error: "Franchisees cannot change ticket status" },
        { status: 403 },
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

    // A HARDWARE_MINER/POOL_HASHRATE ticket can't be resolved/closed while
    // its miner is still flagged UNDER_MAINTENANCE/DEPLOYMENT_IN_PROGRESS -
    // minerId is mandatory on these categories since creation, so a missing
    // miner here would mean a pre-existing ticket from before that rule.
    if (
      (status === "RESOLVED" || status === "CLOSED") &&
      (ticket.category === "HARDWARE_MINER" ||
        ticket.category === "POOL_HASHRATE")
    ) {
      if (!ticket.miner) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This ticket has no miner linked - one must be attached before it can be resolved or closed",
          },
          { status: 400 },
        );
      }
      if (ticket.miner.status !== "AUTO") {
        return NextResponse.json(
          {
            success: false,
            error: `The miner must be set to AUTO before this ticket can be resolved or closed (currently ${ticket.miner.status})`,
          },
          { status: 400 },
        );
      }
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

    // Best-effort live telemetry snapshot at resolution/closure - same
    // treatment as the one attached at ticket creation, never blocks the
    // status change if the pool fetch fails.
    if (
      (status === "RESOLVED" || status === "CLOSED") &&
      (ticket.category === "HARDWARE_MINER" ||
        ticket.category === "POOL_HASHRATE") &&
      ticket.miner
    ) {
      try {
        const snapshot = await getLiveMinerTelemetry(ticket.miner.id);
        if (snapshot) {
          await prisma.ticketMessage.create({
            data: {
              ticketId: id,
              authorId: null,
              isInternal: true,
              isSystemGenerated: true,
              body: `Live ${snapshot.poolName} telemetry at ticket ${status.toLowerCase()}: status ${snapshot.status}, ${snapshot.hashrateThs?.toFixed(2) ?? "?"} TH/s${
                snapshot.efficiency !== null
                  ? `, ${snapshot.efficiency.toFixed(2)}% efficiency`
                  : ""
              }.`,
              metadata: snapshot as unknown as Prisma.InputJsonValue,
            },
          });
        }
      } catch (telemetryError) {
        console.error(
          "[Ticket Detail API] Live telemetry snapshot failed (non-fatal):",
          telemetryError,
        );
      }
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Ticket Detail API] PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update ticket" },
      { status: 500 },
    );
  }
}
