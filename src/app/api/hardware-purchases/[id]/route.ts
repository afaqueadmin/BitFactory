import { isStaffRole } from "@/lib/auth/staffRoles";
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
import { checkVendorForInvoice } from "@/lib/accounting/vendorRules";
import {
  adjustedOnInvoice,
  checkInvoiceChangeWithAdjustments,
} from "@/lib/accounting/vendorDeposit";

interface UpdateHardwarePurchaseRequest {
  invoiceNumber?: string;
  vendorId?: string;
  hardwareDescription?: string;
  billingDate?: string;
  dueDate?: string;
  quantity?: number;
  unitPrice?: number;
  miscellaneousCharges?: number;
  securityDeposit?: number;
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

    if (!user || !isStaffRole(user.role)) {
      return NextResponse.json(
        { error: "Only administrators can update hardware purchase invoices" },
        { status: 403 },
      );
    }
    const invoice = await prisma.hardwarePurchaseInvoice.findUnique({
      where: { id: invoiceId },
      include: vendorPaymentInclude,
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Hardware purchase invoice not found" },
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
    console.error("Error fetching hardware purchase invoice:", error);
    return NextResponse.json(
      { error: "Failed to fetch hardware purchase invoice" },
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

    if (!user || !isStaffRole(user.role)) {
      return NextResponse.json(
        { error: "Only administrators can update hardware purchase invoices" },
        { status: 403 },
      );
    }

    // Check if invoice exists
    const existingInvoice = await prisma.hardwarePurchaseInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!existingInvoice) {
      return NextResponse.json(
        { error: "Hardware purchase invoice not found" },
        { status: 404 },
      );
    }

    const body: UpdateHardwarePurchaseRequest = await request.json();

    const ruleError = checkVendorInvoiceUpdate(
      {
        paymentStatus: existingInvoice.paymentStatus,
        paidDate: existingInvoice.paidDate,
        amounts: {
          quantity: existingInvoice.quantity,
          unitPrice: existingInvoice.unitPrice,
          miscellaneousCharges: existingInvoice.miscellaneousCharges,
          securityDeposit: existingInvoice.securityDeposit,
          totalAmount: existingInvoice.totalAmount,
        },
      },
      {
        paymentStatus: body.paymentStatus,
        paidDate: body.paidDate,
        amounts: {
          quantity: body.quantity,
          unitPrice: body.unitPrice,
          miscellaneousCharges: body.miscellaneousCharges,
          securityDeposit: body.securityDeposit,
          totalAmount: body.totalAmount,
        },
      },
    );
    if (ruleError) {
      return NextResponse.json({ error: ruleError }, { status: 400 });
    }

    const adjustmentError = checkInvoiceChangeWithAdjustments(
      await adjustedOnInvoice(prisma, "hardware", invoiceId),
      {
        cancel:
          body.paymentStatus === "Cancelled" &&
          existingInvoice.paymentStatus !== "Cancelled",
        vendorChanged:
          body.vendorId !== undefined &&
          body.vendorId !== existingInvoice.vendorId,
        newTotal: body.totalAmount,
      },
    );
    if (adjustmentError) {
      return NextResponse.json({ error: adjustmentError }, { status: 400 });
    }

    if (
      body.securityDeposit !== undefined &&
      (!Number.isFinite(body.securityDeposit) || body.securityDeposit < 0)
    ) {
      return NextResponse.json(
        { error: "Security deposit cannot be negative" },
        { status: 400 },
      );
    }

    // Validate required fields if they are being updated
    if (body.quantity !== undefined && body.quantity < 0) {
      return NextResponse.json(
        { error: "Quantity cannot be negative" },
        { status: 400 },
      );
    }

    if (body.unitPrice !== undefined && body.unitPrice < 0) {
      return NextResponse.json(
        { error: "Unit price cannot be negative" },
        { status: 400 },
      );
    }

    if (body.vendorId !== undefined) {
      const vendor = await checkVendorForInvoice(
        body.vendorId,
        "hardware",
        existingInvoice.vendorId,
      );
      if ("error" in vendor) {
        return NextResponse.json({ error: vendor.error }, { status: 400 });
      }
    }

    // If invoice number is being changed, check for duplicates
    if (
      body.invoiceNumber &&
      body.invoiceNumber !== existingInvoice.invoiceNumber
    ) {
      const duplicateInvoice = await prisma.hardwarePurchaseInvoice.findUnique({
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
      vendorId?: string;
      hardwareDescription?: string;
      billingDate?: Date;
      dueDate?: Date;
      quantity?: number;
      unitPrice?: Decimal;
      miscellaneousCharges?: Decimal;
      securityDeposit?: Decimal;
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
    if (body.vendorId !== undefined) {
      updateData.vendorId = body.vendorId;
    }
    if (body.hardwareDescription !== undefined) {
      updateData.hardwareDescription = body.hardwareDescription;
    }
    if (body.billingDate !== undefined) {
      updateData.billingDate = new Date(body.billingDate);
    }
    if (body.dueDate !== undefined) {
      updateData.dueDate = new Date(body.dueDate);
    }
    if (body.quantity !== undefined) {
      updateData.quantity = body.quantity;
    }
    if (body.unitPrice !== undefined) {
      updateData.unitPrice = new Decimal(body.unitPrice);
    }
    if (body.miscellaneousCharges !== undefined) {
      updateData.miscellaneousCharges = new Decimal(body.miscellaneousCharges);
    }
    if (body.securityDeposit !== undefined) {
      updateData.securityDeposit = new Decimal(body.securityDeposit);
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

    // Update the hardware purchase invoice
    const updatedInvoice = await prisma.hardwarePurchaseInvoice.update({
      where: { id: invoiceId },
      data: updateData,
      include: vendorPaymentInclude,
    });

    const changedFields: Partial<UpdateDataType> = { ...updateData };
    delete changedFields.updatedBy;
    await prisma.auditLog.create({
      data: {
        action: AuditAction.HARDWARE_PURCHASE_INVOICE_UPDATED,
        entityType: "HardwarePurchaseInvoice",
        entityId: updatedInvoice.id,
        userId,
        description: `Hardware purchase invoice ${updatedInvoice.invoiceNumber} updated`,
        changes: JSON.stringify(changedFields),
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: updatedInvoice,
        message: "Hardware purchase invoice updated successfully",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error updating hardware purchase invoice:", error);
    return NextResponse.json(
      { error: "Failed to update hardware purchase invoice" },
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

    if (!user || !isStaffRole(user.role)) {
      return NextResponse.json(
        { error: "Only administrators can delete hardware purchase invoices" },
        { status: 403 },
      );
    }

    const existingInvoice = await prisma.hardwarePurchaseInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!existingInvoice) {
      return NextResponse.json(
        { error: "Hardware purchase invoice not found" },
        { status: 404 },
      );
    }

    if (existingInvoice.paymentStatus === "Paid") {
      return NextResponse.json(
        { error: "Paid invoices can't be deleted" },
        { status: 400 },
      );
    }

    const adjustmentError = checkInvoiceChangeWithAdjustments(
      await adjustedOnInvoice(prisma, "hardware", invoiceId),
      { remove: true },
    );
    if (adjustmentError) {
      return NextResponse.json({ error: adjustmentError }, { status: 400 });
    }

    // Remove its PDFs from R2 first; if that fails, keep the invoice so
    // no file is left without a record pointing at it.
    try {
      await deleteInvoicePdfs([
        existingInvoice.invoicePdfKey,
        existingInvoice.invoiceSheetKey,
        existingInvoice.paymentReceiptKey,
      ]);
    } catch (error) {
      console.error("Error deleting hardware purchase PDFs:", error);
      return NextResponse.json(
        { error: PDF_DELETE_FAILED_MESSAGE },
        { status: 500 },
      );
    }

    await prisma.hardwarePurchaseInvoice.delete({ where: { id: invoiceId } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.HARDWARE_PURCHASE_INVOICE_DELETED,
        entityType: "HardwarePurchaseInvoice",
        entityId: invoiceId,
        userId,
        description: `Hardware purchase invoice ${existingInvoice.invoiceNumber} deleted`,
        changes: JSON.stringify({
          invoicePdfKey: existingInvoice.invoicePdfKey,
          invoiceSheetKey: existingInvoice.invoiceSheetKey,
          paymentReceiptKey: existingInvoice.paymentReceiptKey,
        }),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Hardware purchase invoice deleted successfully",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error deleting hardware purchase invoice:", error);
    return NextResponse.json(
      { error: "Failed to delete hardware purchase invoice" },
      { status: 500 },
    );
  }
}
