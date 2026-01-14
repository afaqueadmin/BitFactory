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

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const where: Record<string, unknown> = {};
    if (customerId) where.userId = customerId;
    if (status) where.status = status as InvoiceStatus;

    const skip = (page - 1) * limit;

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          createdByUser: { select: { id: true, email: true, name: true } },
          payments: {
            include: {
              costPayment: true,
            },
          },
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
    const {
      customerId,
      totalMiners,
      unitPrice,
      dueDate,
      status = InvoiceStatus.DRAFT,
    } = body;

    if (!customerId || !totalMiners || !unitPrice || !dueDate) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: customerId, totalMiners, unitPrice, dueDate",
        },
        { status: 400 },
      );
    }

    // Generate invoice number
    const timestamp = new Date();
    const invoiceNumber = `INV-${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, "0")}${String(timestamp.getDate()).padStart(2, "0")}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

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
