import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction, InvoiceStatus } from "@/generated/prisma";
import { sendInvoiceCancellationEmail } from "@/lib/email";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await verifyJwtToken(token);

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            luxorSubaccountName: true,
          },
        },
        createdByUser: { select: { id: true, email: true, name: true } },
        updatedByUser: { select: { id: true, email: true, name: true } },
        costPayments: true,
        notifications: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Fetch group information if customer has a Luxor subaccount
    let group = null;
    if (invoice.user.luxorSubaccountName) {
      group = await prisma.group.findFirst({
        where: {
          subaccounts: {
            some: {
              subaccountName: invoice.user.luxorSubaccountName,
            },
          },
        },
        select: {
          id: true,
          name: true,
          relationshipManager: true,
          email: true,
        },
      });
    }

    const response = NextResponse.json({ ...invoice, group });
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    return response;
  } catch (error) {
    console.error("Get invoice error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoice" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can update invoices" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { totalMiners, unitPrice, dueDate } = body;

    const currentInvoice = await prisma.invoice.findUnique({
      where: { id },
    });

    if (!currentInvoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Only allow editing DRAFT invoices
    if (currentInvoice.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Only DRAFT invoices can be edited" },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = { updatedBy: userId };
    const changes: Record<string, unknown> = {};

    if (totalMiners !== undefined) {
      updateData.totalMiners = totalMiners;
      changes.totalMiners = {
        from: currentInvoice.totalMiners,
        to: totalMiners,
      };
    }
    if (unitPrice !== undefined) {
      updateData.unitPrice = unitPrice;
      changes.unitPrice = { from: currentInvoice.unitPrice, to: unitPrice };
    }
    if (dueDate) {
      updateData.dueDate = new Date(dueDate);
      changes.dueDate = dueDate;
    }

    // Recalculate totalAmount if totalMiners or unitPrice changed
    const newTotalMiners =
      totalMiners !== undefined ? totalMiners : currentInvoice.totalMiners;
    const newUnitPrice =
      unitPrice !== undefined ? unitPrice : Number(currentInvoice.unitPrice);
    const newTotalAmount = parseFloat(
      (newTotalMiners * newUnitPrice).toFixed(2),
    );

    if (newTotalAmount !== Number(currentInvoice.totalAmount)) {
      updateData.totalAmount = newTotalAmount;
      changes.totalAmount = {
        from: currentInvoice.totalAmount,
        to: newTotalAmount,
      };
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, email: true, name: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
        updatedByUser: { select: { id: true, email: true, name: true } },
        costPayments: true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        action: AuditAction.INVOICE_UPDATED,
        entityType: "Invoice",
        entityId: invoice.id,
        userId,
        description: `Invoice ${invoice.invoiceNumber} updated`,
        changes: JSON.stringify(changes),
      },
    });

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("Update invoice error:", error);
    return NextResponse.json(
      { error: "Failed to update invoice" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can update invoices" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { status, issuedDate, paidDate, dueDate } = body;

    const currentInvoice = await prisma.invoice.findUnique({
      where: { id },
    });

    if (!currentInvoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { updatedBy: userId };
    const changes: Record<string, unknown> = {};

    if (status) {
      updateData.status = status;
      changes.status = { from: currentInvoice.status, to: status };

      // Auto-set issuedDate when changing to ISSUED
      if (status === "ISSUED" && !currentInvoice.issuedDate) {
        updateData.issuedDate = new Date();
        changes.issuedDate = new Date().toISOString();
      }
    }
    if (issuedDate) {
      updateData.issuedDate = new Date(issuedDate);
      changes.issuedDate = issuedDate;
    }
    if (paidDate) {
      updateData.paidDate = new Date(paidDate);
      changes.paidDate = paidDate;
    }
    if (dueDate) {
      updateData.dueDate = new Date(dueDate);
      changes.dueDate = dueDate;
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, email: true, name: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
        updatedByUser: { select: { id: true, email: true, name: true } },
        costPayments: true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        action: AuditAction.INVOICE_UPDATED,
        entityType: "Invoice",
        entityId: invoice.id,
        userId,
        description: `Invoice ${invoice.invoiceNumber} updated`,
        changes: JSON.stringify(changes),
      },
    });

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("Update invoice error:", error);
    return NextResponse.json(
      { error: "Failed to update invoice" },
      { status: 500 },
    );
  }
}

// POST: Cancel an ISSUED invoice
// Only ISSUED invoices can be cancelled (DRAFT invoices should be deleted)
// Prevents cancelling already PAID invoices
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

    const decoded = await verifyJwtToken(token);
    const userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can cancel invoices" },
        { status: 403 },
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Only allow cancelling ISSUED invoices
    if (invoice.status !== InvoiceStatus.ISSUED) {
      return NextResponse.json(
        {
          error:
            "Only ISSUED invoices can be cancelled. DRAFT invoices should be deleted.",
        },
        { status: 400 },
      );
    }

    // Update invoice status to CANCELLED
    const cancelledInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.CANCELLED,
        updatedBy: userId,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    // Log audit - default reason: "Invoice cancelled by admin"
    await prisma.auditLog.create({
      data: {
        action: AuditAction.INVOICE_CANCELLED,
        entityType: "Invoice",
        entityId: invoice.id,
        userId,
        description: `Invoice ${invoice.invoiceNumber} cancelled by admin`,
        changes: JSON.stringify({
          status: { from: InvoiceStatus.ISSUED, to: InvoiceStatus.CANCELLED },
          reason: "Invoice cancelled by admin",
        }),
      },
    });

    // Send cancellation email to customer (non-blocking)
    if (invoice.user?.email) {
      sendInvoiceCancellationEmail(
        invoice.user.email,
        invoice.user.name || "Valued Customer",
        invoice.invoiceNumber,
        Number(invoice.totalAmount),
        invoice.dueDate || new Date(),
      ).catch((err) => {
        console.error(
          `Failed to send cancellation email for ${invoice.invoiceNumber}:`,
          err,
        );
      });

      // Create notification record
      try {
        await prisma.invoiceNotification.create({
          data: {
            invoiceId: invoice.id,
            notificationType: "INVOICE_CANCELLED",
            sentTo: invoice.user.email,
            sentAt: new Date(),
            status: "SENT",
          },
        });
      } catch (notificationErr) {
        console.error(
          `Failed to create cancellation notification:`,
          notificationErr,
        );
      }
    }

    return NextResponse.json(cancelledInvoice);
  } catch (error) {
    console.error("Cancel invoice error:", error);
    return NextResponse.json(
      { error: "Failed to cancel invoice" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can delete invoices" },
        { status: 403 },
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (
      invoice.status !== InvoiceStatus.DRAFT &&
      invoice.status !== InvoiceStatus.CANCELLED
    ) {
      return NextResponse.json(
        {
          error: "Only DRAFT or CANCELLED invoices can be deleted",
        },
        { status: 400 },
      );
    }

    const invoiceNumber = invoice.invoiceNumber;

    // Delete invoice (cascade deletes payments and notifications)
    await prisma.invoice.delete({
      where: { id },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        action: AuditAction.INVOICE_CANCELLED,
        entityType: "Invoice",
        entityId: id,
        userId,
        description: `Invoice ${invoiceNumber} deleted`,
        changes: JSON.stringify({}),
      },
    });

    return NextResponse.json({ success: true, message: "Invoice deleted" });
  } catch (error) {
    console.error("Delete invoice error:", error);
    return NextResponse.json(
      { error: "Failed to delete invoice" },
      { status: 500 },
    );
  }
}
