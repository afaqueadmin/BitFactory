import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { InvoiceStatus, AuditAction } from "@/generated/prisma";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      const decoded = await verifyJwtToken(token);
      const userId = decoded.userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Only administrators can access invoices" },
          { status: 403 },
        );
      }
    }

    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const where: Record<string, unknown> = {};
    if (customerId) where.userId = customerId;
    if (status) {
      where.status = status as InvoiceStatus;
    }
    // Note: CANCELLED invoices are now included in the dashboard table
    // They won't affect calculations (amount, outstanding, etc) as they're already excluded from those queries

    const skip = (page - 1) * limit;

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          createdByUser: { select: { id: true, email: true, name: true } },
          costPayments: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    return NextResponse.json({
      invoices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get invoices error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 },
    );
  }
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
        { error: "Only administrators can create invoices" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { customerId, totalMiners, unitPrice, dueDate } = body;

    // Status is always DRAFT when creating new invoices
    // Admins can change to ISSUED after creation via the status change endpoint
    const status = InvoiceStatus.DRAFT;

    if (!customerId || !totalMiners || !unitPrice || !dueDate) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: customerId, totalMiners, unitPrice, dueDate",
        },
        { status: 400 },
      );
    }

    // Fetch customer to get luxorSubaccountName
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: { luxorSubaccountName: true },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    if (!customer.luxorSubaccountName) {
      return NextResponse.json(
        { error: "Customer does not have a Luxor subaccount name" },
        { status: 400 },
      );
    }

    // Generate invoice number: luxorSubaccountName-YYYYMMDD-sequence
    const timestamp = new Date();
    const dateStr = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, "0")}${String(timestamp.getDate()).padStart(2, "0")}`;

    // Get last invoice for this customer (cumulative counter, not daily)
    const customerLastInvoice = await prisma.invoice.findFirst({
      where: {
        userId: customerId,
      },
      select: { invoiceNumber: true },
      orderBy: { createdAt: "desc" },
    });

    // Extract sequence number from last invoice and increment
    // Format: subaccount-YYYYMMDD-XXX where XXX is the sequence
    const lastSeq = customerLastInvoice
      ? parseInt(
          customerLastInvoice.invoiceNumber.split("-").pop() || "0",
          10,
        ) || 0
      : 0;
    const sequenceNumber = String(lastSeq + 1).padStart(3, "0");
    const invoiceNumber = `${customer.luxorSubaccountName}-${dateStr}-${sequenceNumber}`;

    const totalAmount = totalMiners * Number(unitPrice);

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        userId: customerId,
        totalMiners,
        unitPrice: parseFloat(unitPrice),
        totalAmount,
        status: status || InvoiceStatus.DRAFT,
        invoiceGeneratedDate: timestamp,
        dueDate: new Date(dueDate),
        createdBy: userId,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        action: AuditAction.INVOICE_CREATED,
        entityType: "Invoice",
        entityId: invoice.id,
        userId,
        description: `Invoice ${invoice.invoiceNumber} created for customer ${customerId}`,
        changes: JSON.stringify({
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount.toString(),
          status: invoice.status,
        }),
      },
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("Create invoice error:", error);
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 },
    );
  }
}
