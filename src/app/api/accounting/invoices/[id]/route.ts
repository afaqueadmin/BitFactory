import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction, InvoiceStatus } from "@/generated/prisma";

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
        user: { select: { id: true, email: true, name: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
        updatedByUser: { select: { id: true, email: true, name: true } },
        payments: {
          include: {
            costPayment: true,
          },
        },
        notifications: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("Get invoice error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoice" },
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
        payments: {
          include: {
            costPayment: true,
          },
        },
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
