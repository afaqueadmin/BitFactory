import { NextResponse } from "next/server";
import { AuditAction, InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parseRepairInvoiceInput,
  REPAIR_MINER_SELECT,
} from "@/lib/accounting/hardwareRepair";
import { costPaymentAccountInclude } from "@/lib/accounting/costPaymentAccounts";
import {
  INVOICE_NUMBER_CUSTOMER_SELECT,
  nextInvoiceNumber,
} from "./invoiceNumber";

/**
 * Hardware Repair invoices (invoiceType HARDWARE_REPAIR): one miner, free-
 * text line items stored as lineItemType REPAIR (description in `model`, no
 * hardwareId), a flat discount, and a linked MinerRepairNote that is kept in
 * sync with the invoice (and cascades away when the invoice is deleted).
 */

const userSelect = { select: { id: true, email: true, name: true } };

/** The miner must exist, not be deleted, and belong to the customer. */
async function findCustomerMiner(minerId: string, customerId: string) {
  const miner = await prisma.miner.findUnique({
    where: { id: minerId },
    select: { id: true, userId: true, isDeleted: true },
  });
  return miner && !miner.isDeleted && miner.userId === customerId
    ? miner
    : null;
}

const toLineItemRows = (
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>,
) =>
  lineItems.map((li) => ({
    model: li.description,
    quantity: li.quantity,
    unitPrice: li.unitPrice,
    totalPrice: li.totalPrice,
    lineItemType: "REPAIR" as const,
  }));

export async function createRepairInvoice(params: {
  body: Record<string, unknown>;
  userId: string;
  customerId: string;
  dueDate: string;
  invoiceGeneratedDate?: string;
  machineHostingLocation: string[];
}): Promise<NextResponse> {
  const { body, userId, customerId, dueDate, invoiceGeneratedDate } = params;

  const parsed = parseRepairInvoiceInput(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const customer = await prisma.user.findUnique({
    where: { id: customerId },
    select: INVOICE_NUMBER_CUSTOMER_SELECT,
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  if (!(await findCustomerMiner(parsed.minerId, customerId))) {
    return NextResponse.json(
      { error: "Miner not found for this customer" },
      { status: 400 },
    );
  }

  const timestamp = new Date();
  const invoiceNumber = await nextInvoiceNumber(
    customerId,
    customer,
    timestamp,
  );
  const issuedOn = invoiceGeneratedDate
    ? new Date(invoiceGeneratedDate)
    : timestamp;

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        invoiceNumber,
        userId: customerId,
        // totalMiners/unitPrice are required summary columns: one miner,
        // billed the line-item subtotal (totalAmount is after discount).
        totalMiners: 1,
        unitPrice: parsed.subtotal,
        totalAmount: parsed.total,
        discountAmount: parsed.discount,
        minerId: parsed.minerId,
        status: InvoiceStatus.DRAFT,
        invoiceType: "HARDWARE_REPAIR",
        invoiceGeneratedDate: issuedOn,
        dueDate: new Date(dueDate),
        machineHostingLocation: params.machineHostingLocation,
        createdBy: userId,
        lineItems: { create: toLineItemRows(parsed.lineItems) },
        repairNote: {
          create: {
            note: parsed.repairNote,
            dateOfEntry: issuedOn,
            miner: { connect: { id: parsed.minerId } },
            createdBy: { connect: { id: userId } },
          },
        },
      },
      include: {
        user: userSelect,
        createdByUser: userSelect,
        lineItems: true,
        miner: { select: REPAIR_MINER_SELECT },
        repairNote: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: AuditAction.INVOICE_CREATED,
        entityType: "Invoice",
        entityId: created.id,
        userId,
        description: `Invoice ${created.invoiceNumber} created for customer ${customerId}`,
        changes: JSON.stringify({
          invoiceNumber: created.invoiceNumber,
          totalAmount: created.totalAmount.toString(),
          discountAmount: created.discountAmount.toString(),
          minerId: parsed.minerId,
          status: created.status,
        }),
      },
    });
    await tx.auditLog.create({
      data: {
        action: AuditAction.MINER_REPAIR_NOTE_ADDED,
        entityType: "Miner",
        entityId: parsed.minerId,
        userId,
        description: `Repair note added from invoice ${created.invoiceNumber}`,
      },
    });

    return created;
  });

  return NextResponse.json(invoice, { status: 201 });
}

export async function updateRepairInvoice(params: {
  currentInvoice: {
    id: string;
    invoiceNumber: string;
    userId: string;
    minerId: string | null;
    totalAmount: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    dueDate: Date;
    lineItems: Array<{
      model: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
    }>;
  };
  body: Record<string, unknown>;
  userId: string;
}): Promise<NextResponse> {
  const { currentInvoice, body, userId } = params;

  const parsed = parseRepairInvoiceInput(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (!(await findCustomerMiner(parsed.minerId, currentInvoice.userId))) {
    return NextResponse.json(
      { error: "Miner not found for this customer" },
      { status: 400 },
    );
  }

  const dueDate =
    typeof body.dueDate === "string" && body.dueDate
      ? new Date(body.dueDate)
      : undefined;
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
  }

  const machineHostingLocation = Array.isArray(body.machineHostingLocation)
    ? Array.from(
        new Set(
          (body.machineHostingLocation as unknown[])
            .filter((loc): loc is string => typeof loc === "string")
            .map((loc) => loc.trim())
            .filter((loc) => loc.length > 0),
        ),
      )
    : undefined;

  const changes: Record<string, unknown> = {
    lineItems: {
      from: currentInvoice.lineItems.map((li) => ({
        description: li.model,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
      })),
      to: parsed.lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
      })),
    },
  };
  if (Number(currentInvoice.totalAmount) !== parsed.total) {
    changes.totalAmount = {
      from: currentInvoice.totalAmount,
      to: parsed.total,
    };
  }
  if (Number(currentInvoice.discountAmount) !== parsed.discount) {
    changes.discountAmount = {
      from: currentInvoice.discountAmount,
      to: parsed.discount,
    };
  }
  if (currentInvoice.minerId !== parsed.minerId) {
    changes.minerId = { from: currentInvoice.minerId, to: parsed.minerId };
  }
  if (dueDate) changes.dueDate = body.dueDate;

  const invoice = await prisma.$transaction(async (tx) => {
    const existingNote = await tx.minerRepairNote.findUnique({
      where: { invoiceId: currentInvoice.id },
      select: { id: true, minerId: true, note: true },
    });

    const updated = await tx.invoice.update({
      where: { id: currentInvoice.id },
      data: {
        updatedBy: userId,
        minerId: parsed.minerId,
        totalMiners: 1,
        unitPrice: parsed.subtotal,
        totalAmount: parsed.total,
        discountAmount: parsed.discount,
        ...(dueDate ? { dueDate } : {}),
        ...(machineHostingLocation ? { machineHostingLocation } : {}),
        lineItems: {
          deleteMany: {},
          create: toLineItemRows(parsed.lineItems),
        },
      },
      select: { id: true, invoiceGeneratedDate: true },
    });

    // Keep the invoice's repair note in sync (create it if it was removed
    // from the Miners page). A miner change moves the note to the new miner.
    let noteAction: AuditAction | null = null;
    if (!existingNote) {
      await tx.minerRepairNote.create({
        data: {
          note: parsed.repairNote,
          dateOfEntry: updated.invoiceGeneratedDate,
          miner: { connect: { id: parsed.minerId } },
          createdBy: { connect: { id: userId } },
          invoice: { connect: { id: currentInvoice.id } },
        },
      });
      noteAction = AuditAction.MINER_REPAIR_NOTE_ADDED;
    } else if (
      existingNote.note !== parsed.repairNote ||
      existingNote.minerId !== parsed.minerId
    ) {
      await tx.minerRepairNote.update({
        where: { id: existingNote.id },
        data: {
          note: parsed.repairNote,
          miner: { connect: { id: parsed.minerId } },
        },
      });
      noteAction = AuditAction.MINER_REPAIR_NOTE_UPDATED;
    }
    if (noteAction) {
      await tx.auditLog.create({
        data: {
          action: noteAction,
          entityType: "Miner",
          entityId: parsed.minerId,
          userId,
          description:
            noteAction === AuditAction.MINER_REPAIR_NOTE_ADDED
              ? `Repair note added from invoice ${currentInvoice.invoiceNumber}`
              : `Repair note updated from invoice ${currentInvoice.invoiceNumber}`,
        },
      });
      changes.repairNote = "updated";
    }

    await tx.auditLog.create({
      data: {
        action: AuditAction.INVOICE_UPDATED,
        entityType: "Invoice",
        entityId: currentInvoice.id,
        userId,
        description: `Invoice ${currentInvoice.invoiceNumber} updated`,
        changes: JSON.stringify(changes),
      },
    });

    return tx.invoice.findUniqueOrThrow({
      where: { id: updated.id },
      // Keep the payment accounts: this response replaces the cached
      // invoice, and the Payments card would otherwise show "—".
      include: {
        user: userSelect,
        createdByUser: userSelect,
        updatedByUser: userSelect,
        costPayments: { include: costPaymentAccountInclude },
        lineItems: true,
        miner: { select: REPAIR_MINER_SELECT },
        repairNote: true,
      },
    });
  });

  return NextResponse.json(invoice);
}
