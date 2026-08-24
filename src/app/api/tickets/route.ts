/**
 * /api/tickets
 *
 * GET: list tickets visible to the caller.
 *   - CLIENT: only tickets they raised.
 *   - FRANCHISEE: tickets raised anywhere in their own franchise (their own
 *     personal-account tickets + their onboarded clients' tickets).
 *   - ADMIN/SUPER_ADMIN: every ticket.
 *
 * POST: raise a new ticket. CLIENT/FRANCHISEE only. A FRANCHISEE can raise
 * either for their own personal mining account (the same way a CLIENT
 * does) or, via onBehalfOfUserId, for one of their own onboarded clients -
 * raisedById is always the actual submitter either way. If category is
 * HARDWARE_MINER or POOL_HASHRATE and a minerId is given, a live
 * Luxor/Braiins telemetry snapshot is fetched and attached as a
 * system-generated internal message - best-effort, never blocks creation.
 * If category is BILLING_INVOICE, an invoiceId can pin the ticket to the
 * specific invoice being disputed, the same way minerId pins a hardware
 * ticket to a specific machine.
 *
 * Priority is a support/triage concept, not something a CLIENT sets or
 * sees: a CLIENT-submitted priority is ignored (always created as NORMAL),
 * and `priority` is stripped out of every ticket in a CLIENT's GET
 * response. ADMIN/SUPER_ADMIN/FRANCHISEE can set it at creation and change
 * it later via PATCH /api/tickets/[id].
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import {
  ticketListWhereForUser,
  resolveTicketFranchiseId,
  stripPriorityForClient,
} from "@/lib/ticketScope";
import {
  assertFranchiseeOwnsMiner,
  assertFranchiseeOwnsCustomer,
} from "@/lib/franchiseeScope";
import { getLiveMinerTelemetry } from "@/lib/ticketTelemetry";

const CATEGORIES = new Set([
  "HARDWARE_MINER",
  "BILLING_INVOICE",
  "POOL_HASHRATE",
  "ACCOUNT",
  "OTHER",
]);
const PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);
const STATUSES = new Set([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "RESOLVED",
  "CLOSED",
]);

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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const statusParam = searchParams.get("status");
    const categoryParam = searchParams.get("category");
    const priorityParam = searchParams.get("priority");

    const where: Prisma.SupportTicketWhereInput = {
      ...ticketListWhereForUser(auth.decoded),
      ...(statusParam && STATUSES.has(statusParam)
        ? {
            status: statusParam as
              | "OPEN"
              | "IN_PROGRESS"
              | "WAITING_ON_CUSTOMER"
              | "RESOLVED"
              | "CLOSED",
          }
        : {}),
      ...(categoryParam && CATEGORIES.has(categoryParam)
        ? {
            category: categoryParam as
              | "HARDWARE_MINER"
              | "BILLING_INVOICE"
              | "POOL_HASHRATE"
              | "ACCOUNT"
              | "OTHER",
          }
        : {}),
      ...(priorityParam && PRIORITIES.has(priorityParam)
        ? { priority: priorityParam as "LOW" | "NORMAL" | "HIGH" | "URGENT" }
        : {}),
    };

    const tickets = await prisma.supportTicket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        raisedBy: { select: { id: true, name: true, email: true, role: true } },
        onBehalfOf: { select: { id: true, name: true, email: true } },
        franchise: { select: { id: true, businessName: true } },
        miner: { select: { id: true, name: true } },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            status: true,
          },
        },
        assignedTo: { select: { id: true, name: true, email: true } },
        _count: { select: { messages: true } },
      },
    });

    // Priority is a triage concept for support/franchise staff, not for the
    // client raising the ticket - never expose it to a CLIENT viewer.
    const data =
      auth.decoded.role === "CLIENT"
        ? tickets.map(stripPriorityForClient)
        : tickets;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Tickets API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch tickets" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    if (auth.decoded.role !== "CLIENT" && auth.decoded.role !== "FRANCHISEE") {
      return NextResponse.json(
        {
          success: false,
          error: "Only clients or franchisees can raise tickets",
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      subject,
      category,
      priority,
      message,
      minerId,
      invoiceId,
      onBehalfOfUserId,
    } = body as {
      subject?: string;
      category?: string;
      priority?: string;
      message?: string;
      minerId?: string;
      invoiceId?: string;
      onBehalfOfUserId?: string;
    };

    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return NextResponse.json(
        { success: false, error: "Subject is required" },
        { status: 400 },
      );
    }
    if (subject.length > 200) {
      return NextResponse.json(
        { success: false, error: "Subject must not exceed 200 characters" },
        { status: 400 },
      );
    }
    if (!category || !CATEGORIES.has(category)) {
      return NextResponse.json(
        {
          success: false,
          error: `category must be one of: ${[...CATEGORIES].join(", ")}`,
        },
        { status: 400 },
      );
    }
    if (
      priority !== undefined &&
      auth.decoded.role !== "CLIENT" &&
      !PRIORITIES.has(priority)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `priority must be one of: ${[...PRIORITIES].join(", ")}`,
        },
        { status: 400 },
      );
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "An initial message describing the issue is required",
        },
        { status: 400 },
      );
    }
    if (message.length > 5000) {
      return NextResponse.json(
        { success: false, error: "Message must not exceed 5000 characters" },
        { status: 400 },
      );
    }

    let resolvedOnBehalfOfUserId: string | null = null;
    if (onBehalfOfUserId) {
      if (auth.decoded.role !== "FRANCHISEE") {
        return NextResponse.json(
          {
            success: false,
            error: "Only a franchisee can raise a ticket on behalf of a client",
          },
          { status: 403 },
        );
      }
      const owns = await assertFranchiseeOwnsCustomer(
        auth.decoded.userId,
        onBehalfOfUserId,
      );
      if (!owns) {
        return NextResponse.json(
          { success: false, error: "You do not have access to this customer" },
          { status: 403 },
        );
      }
      resolvedOnBehalfOfUserId = onBehalfOfUserId;
    }

    let resolvedMinerId: string | null = null;
    if (minerId) {
      const miner = await prisma.miner.findUnique({
        where: { id: minerId },
        select: { id: true, userId: true },
      });
      if (!miner) {
        return NextResponse.json(
          { success: false, error: "Miner not found" },
          { status: 404 },
        );
      }
      const ownsIt =
        miner.userId === auth.decoded.userId ||
        (auth.decoded.role === "FRANCHISEE" &&
          (await assertFranchiseeOwnsMiner(auth.decoded.userId, miner.id)));
      if (!ownsIt) {
        return NextResponse.json(
          { success: false, error: "You do not have access to this miner" },
          { status: 403 },
        );
      }
      resolvedMinerId = miner.id;
    }

    let resolvedInvoiceId: string | null = null;
    if (invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { id: true, userId: true },
      });
      if (!invoice) {
        return NextResponse.json(
          { success: false, error: "Invoice not found" },
          { status: 404 },
        );
      }
      const ownsIt =
        invoice.userId === auth.decoded.userId ||
        (auth.decoded.role === "FRANCHISEE" &&
          (await assertFranchiseeOwnsCustomer(
            auth.decoded.userId,
            invoice.userId,
          )));
      if (!ownsIt) {
        return NextResponse.json(
          { success: false, error: "You do not have access to this invoice" },
          { status: 403 },
        );
      }
      resolvedInvoiceId = invoice.id;
    }

    const franchiseId = await resolveTicketFranchiseId(auth.decoded);

    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          raisedById: auth.decoded.userId,
          onBehalfOfUserId: resolvedOnBehalfOfUserId,
          franchiseId,
          minerId: resolvedMinerId,
          invoiceId: resolvedInvoiceId,
          subject: subject.trim(),
          category: category as
            | "HARDWARE_MINER"
            | "BILLING_INVOICE"
            | "POOL_HASHRATE"
            | "ACCOUNT"
            | "OTHER",
          // A CLIENT can't set priority - it's a support/triage concept,
          // not the customer's call. Always NORMAL for them regardless of
          // what was submitted.
          priority:
            auth.decoded.role === "CLIENT"
              ? "NORMAL"
              : (priority as "LOW" | "NORMAL" | "HIGH" | "URGENT") || "NORMAL",
        },
      });

      await tx.ticketMessage.create({
        data: {
          ticketId: created.id,
          authorId: auth.decoded.userId,
          body: message.trim(),
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.TICKET_CREATED,
          entityType: "SupportTicket",
          entityId: created.id,
          userId: auth.decoded.userId,
          description: `Ticket "${created.subject}" raised (${category})${
            resolvedOnBehalfOfUserId
              ? ` on behalf of customer ${resolvedOnBehalfOfUserId}`
              : ""
          }`,
        },
      });

      return created;
    });

    // Best-effort live telemetry snapshot - never blocks ticket creation.
    if (
      resolvedMinerId &&
      (category === "HARDWARE_MINER" || category === "POOL_HASHRATE")
    ) {
      try {
        const snapshot = await getLiveMinerTelemetry(resolvedMinerId);
        if (snapshot) {
          await prisma.ticketMessage.create({
            data: {
              ticketId: ticket.id,
              authorId: null,
              isInternal: true,
              isSystemGenerated: true,
              body: `Live ${snapshot.poolName} telemetry at ticket creation: status ${snapshot.status}, ${snapshot.hashrateThs?.toFixed(2) ?? "?"} TH/s${
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
          "[Tickets API] Live telemetry snapshot failed (non-fatal):",
          telemetryError,
        );
      }
    }

    const withMessages = await prisma.supportTicket.findUnique({
      where: { id: ticket.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        raisedBy: { select: { id: true, name: true, email: true } },
        onBehalfOf: { select: { id: true, name: true, email: true } },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            status: true,
          },
        },
      },
    });

    const responseData =
      auth.decoded.role === "CLIENT" && withMessages
        ? stripPriorityForClient(withMessages)
        : withMessages;

    return NextResponse.json(
      { success: true, data: responseData, message: "Ticket created" },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Tickets API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create ticket" },
      { status: 500 },
    );
  }
}
