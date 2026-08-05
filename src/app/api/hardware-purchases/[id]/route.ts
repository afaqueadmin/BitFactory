import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { Decimal } from "@prisma/client/runtime/library";
import {
  VENDOR_NAME_OPTIONS,
  VendorNameValue,
} from "@/lib/hooks/useHardwarePurchases";

const VALID_VENDOR_NAMES = VENDOR_NAME_OPTIONS.map((o) => o.value);

interface UpdateHardwarePurchaseRequest {
  invoiceNumber?: string;
  vendorName?: VendorNameValue;
  hardwareDescription?: string;
  billingDate?: string;
  dueDate?: string;
  quantity?: number;
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
        { error: "Only administrators can update hardware purchase invoices" },
        { status: 403 },
      );
    }
    const invoice = await prisma.hardwarePurchaseInvoice.findUnique({
      where: { id: invoiceId },
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

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
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

    if (
      body.vendorName !== undefined &&
      !VALID_VENDOR_NAMES.includes(body.vendorName)
    ) {
      return NextResponse.json(
        {
          error: `vendorName must be one of: ${VALID_VENDOR_NAMES.join(", ")}`,
        },
        { status: 400 },
      );
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
      vendorName?: VendorNameValue;
      hardwareDescription?: string;
      billingDate?: Date;
      dueDate?: Date;
      quantity?: number;
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
    if (body.vendorName !== undefined) {
      updateData.vendorName = body.vendorName;
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

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
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

    await prisma.hardwarePurchaseInvoice.delete({ where: { id: invoiceId } });

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
