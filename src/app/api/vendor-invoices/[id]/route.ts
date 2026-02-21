import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { Decimal } from "@prisma/client/runtime/library";

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

    // Validate required fields if they are being updated
    if (body.totalMiners !== undefined && body.totalMiners <= 0) {
      return NextResponse.json(
        { error: "Total miners must be greater than 0" },
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
