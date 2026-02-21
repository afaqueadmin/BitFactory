import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { Decimal } from "@prisma/client/runtime/library";

interface CreateVendorInvoiceRequest {
  invoiceNumber: string;
  billingDate: string;
  dueDate: string;
  totalMiners: number;
  unitPrice: number;
  miscellaneousCharges: number;
  totalAmount: number;
  notes?: string;
  paymentStatus: "Paid" | "Pending" | "Cancelled";
}

export async function POST(request: NextRequest) {
  try {
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
        { error: "Only administrators can create vendor invoices" },
        { status: 403 },
      );
    }

    const body: CreateVendorInvoiceRequest = await request.json();

    // Validate required fields
    if (
      !body.invoiceNumber ||
      !body.billingDate ||
      !body.dueDate ||
      body.totalMiners <= 0 ||
      body.unitPrice < 0
    ) {
      return NextResponse.json(
        { error: "Missing or invalid required fields" },
        { status: 400 },
      );
    }

    // Check if invoice number already exists
    const existingInvoice = await prisma.vendorInvoice.findUnique({
      where: { invoiceNumber: body.invoiceNumber },
    });

    if (existingInvoice) {
      return NextResponse.json(
        { error: "Invoice number already exists" },
        { status: 400 },
      );
    }

    // Create the vendor invoice
    const vendorInvoice = await prisma.vendorInvoice.create({
      data: {
        invoiceNumber: body.invoiceNumber,
        billingDate: new Date(body.billingDate),
        dueDate: new Date(body.dueDate),
        totalMiners: body.totalMiners,
        unitPrice: new Decimal(body.unitPrice),
        miscellaneousCharges: new Decimal(body.miscellaneousCharges || 0),
        totalAmount: new Decimal(body.totalAmount),
        paymentStatus: body.paymentStatus || "Pending",
        notes: body.notes || null,
        createdBy: userId,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: vendorInvoice,
        message: "Vendor invoice created successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating vendor invoice:", error);
    return NextResponse.json(
      { error: "Failed to create vendor invoice" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
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
        { error: "Only administrators can access vendor invoices" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const paymentStatus = searchParams.get("paymentStatus");

    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    const [vendorInvoices, total] = await Promise.all([
      prisma.vendorInvoice.findMany({
        where,
        include: {
          createdByUser: {
            select: { id: true, email: true, name: true },
          },
          updatedByUser: {
            select: { id: true, email: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.vendorInvoice.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: vendorInvoices,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching vendor invoices:", error);
    return NextResponse.json(
      { error: "Failed to fetch vendor invoices" },
      { status: 500 },
    );
  }
}
