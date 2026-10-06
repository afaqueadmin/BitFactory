import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { Decimal } from "@prisma/client/runtime/library";
import { AuditAction } from "@prisma/client";
import {
  checkVendorInvoiceUpdate,
  deleteInvoicePdfs,
  PDF_DELETE_FAILED_MESSAGE,
  vendorPaymentInclude,
} from "@/lib/accounting/vendorInvoiceRules";

interface UpdateVendorInvoiceRequest {
  invoiceNumber?: string;
  billingDate?: string;
  dueDate?: string;
  totalMiners?: number;
  unitPrice?: number;
  miscellaneousCharges?: number;
  totalAmount?: number;
  notes?: string | null;
  paymentStatus?: "Paid" | "Pending" | "Cancelled";
  paidDate?: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: invoiceId } = await params;

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
        { error: "Only administrators can update vendor invoices" },
        { status: 403 },
      );
    }
    const invoice = await prisma.vendorInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        ...vendorPaymentInclude,
        createdByUser: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        updatedByUser: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Vendor invoice not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: invoice,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching vendor invoice:", error);
    return NextResponse.json(
      { error: "Failed to fetch vendor invoice" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: invoiceId } = await params;
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
        { error: "Only administrators can update vendor invoices" },
        { status: 403 },
      );
    }

    // Check if invoice exists
    const existingInvoice = await prisma.vendorInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!existingInvoice) {
      return NextResponse.json(
        { error: "Vendor invoice not found" },
        { status: 404 },
      );
    }

    const body: UpdateVendorInvoiceRequest = await request.json();

    const ruleError = checkVendorInvoiceUpdate(
      {
        paymentStatus: existingInvoice.paymentStatus,
        paidDate: existingInvoice.paidDate,
        amounts: {
          totalMiners: existingInvoice.totalMiners,
          unitPrice: existingInvoice.unitPrice,
          miscellaneousCharges: existingInvoice.miscellaneousCharges,
          totalAmount: existingInvoice.totalAmount,
        },
      },
      {
        paymentStatus: body.paymentStatus,
        paidDate: body.paidDate,
        amounts: {
          totalMiners: body.totalMiners,
          unitPrice: body.unitPrice,
          miscellaneousCharges: body.miscellaneousCharges,
          totalAmount: body.totalAmount,
        },
      },
    );
    if (ruleError) {
      return NextResponse.json({ error: ruleError }, { status: 400 });
    }

    // Validate required fields if they are being updated
    if (body.totalMiners !== undefined && body.totalMiners < 0) {
      return NextResponse.json(
        { error: "Total miners cannot be negative" },
        { status: 400 },
      );
    }

    if (body.unitPrice !== undefined && body.unitPrice < 0) {
      return NextResponse.json(
        { error: "Unit price cannot be negative" },
        { status: 400 },
      );
    }

    // If invoice number is being changed, check for duplicates
    if (
      body.invoiceNumber &&
      body.invoiceNumber !== existingInvoice.invoiceNumber
    ) {
      const duplicateInvoice = await prisma.vendorInvoice.findUnique({
        where: { invoiceNumber: body.invoiceNumber },
      });

      if (duplicateInvoice) {
        return NextResponse.json(
          { error: "Invoice number already exists" },
          { status: 400 },
        );
      }
    }

    // Prepare update data
    interface UpdateDataType {
      updatedBy: string;
      invoiceNumber?: string;
      billingDate?: Date;
      dueDate?: Date;
      totalMiners?: number;
      unitPrice?: Decimal;
      miscellaneousCharges?: Decimal;
      totalAmount?: Decimal;
      notes?: string | null;
      paymentStatus?: "Paid" | "Pending" | "Cancelled";
      paidDate?: Date | null;
    }

    const updateData: UpdateDataType = {
      updatedBy: userId,
    };

    if (body.invoiceNumber !== undefined) {
      updateData.invoiceNumber = body.invoiceNumber;
    }
    if (body.billingDate !== undefined) {
      updateData.billingDate = new Date(body.billingDate);
    }
    if (body.dueDate !== undefined) {
      updateData.dueDate = new Date(body.dueDate);
    }
    if (body.totalMiners !== undefined) {
      updateData.totalMiners = body.totalMiners;
    }
    if (body.unitPrice !== undefined) {
      updateData.unitPrice = new Decimal(body.unitPrice);
    }
    if (body.miscellaneousCharges !== undefined) {
      updateData.miscellaneousCharges = new Decimal(body.miscellaneousCharges);
    }
    if (body.totalAmount !== undefined) {
      updateData.totalAmount = new Decimal(body.totalAmount);
    }
    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }
    if (body.paymentStatus !== undefined) {
      updateData.paymentStatus = body.paymentStatus;
    }
    if (body.paidDate !== undefined) {
      updateData.paidDate = body.paidDate ? new Date(body.paidDate) : null;
    }

    // Update the vendor invoice
    const updatedInvoice = await prisma.vendorInvoice.update({
      where: { id: invoiceId },
      data: updateData,
      include: {
        ...vendorPaymentInclude,
        createdByUser: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        updatedByUser: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    const changedFields: Partial<UpdateDataType> = { ...updateData };
    delete changedFields.updatedBy;
    await prisma.auditLog.create({
      data: {
        action: AuditAction.VENDOR_INVOICE_UPDATED,
        entityType: "VendorInvoice",
        entityId: updatedInvoice.id,
        userId,
        description: `Vendor invoice ${updatedInvoice.invoiceNumber} updated`,
        changes: JSON.stringify(changedFields),
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: updatedInvoice,
        message: "Vendor invoice updated successfully",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error updating vendor invoice:", error);
    return NextResponse.json(
      { error: "Failed to update vendor invoice" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: invoiceId } = await params;
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
        { error: "Only administrators can delete vendor invoices" },
        { status: 403 },
      );
    }

    const existingInvoice = await prisma.vendorInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!existingInvoice) {
      return NextResponse.json(
        { error: "Vendor invoice not found" },
        { status: 404 },
      );
    }

    if (existingInvoice.paymentStatus === "Paid") {
      return NextResponse.json(
        { error: "Paid invoices can't be deleted" },
        { status: 400 },
      );
    }

    // Remove its PDFs from R2 first; if that fails, keep the invoice so
    // no file is left without a record pointing at it.
    try {
      await deleteInvoicePdfs([
        existingInvoice.invoicePdfKey,
        existingInvoice.paymentReceiptKey,
      ]);
    } catch (error) {
      console.error("Error deleting vendor invoice PDFs:", error);
      return NextResponse.json(
        { error: PDF_DELETE_FAILED_MESSAGE },
        { status: 500 },
      );
    }

    await prisma.vendorInvoice.delete({ where: { id: invoiceId } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.VENDOR_INVOICE_DELETED,
        entityType: "VendorInvoice",
        entityId: invoiceId,
        userId,
        description: `Vendor invoice ${existingInvoice.invoiceNumber} deleted`,
        changes: JSON.stringify({
          invoicePdfKey: existingInvoice.invoicePdfKey,
          paymentReceiptKey: existingInvoice.paymentReceiptKey,
        }),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Vendor invoice deleted successfully",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error deleting vendor invoice:", error);
    return NextResponse.json(
      { error: "Failed to delete vendor invoice" },
      { status: 500 },
    );
  }
}
