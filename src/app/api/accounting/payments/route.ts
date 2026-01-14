import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction, InvoiceStatus } from "@/generated/prisma";

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
        { error: "Only administrators can access invoice payments" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get("invoiceId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const where: Record<string, unknown> = {};
    if (invoiceId) where.invoiceId = invoiceId;

    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      prisma.invoicePayment.findMany({
        where,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              totalAmount: true,
            },
          },
          costPayment: true,
        },
        orderBy: { paidDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.invoicePayment.count({ where }),
    ]);

    return NextResponse.json({
      payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get invoice payments error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoice payments" },
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
        { error: "Only administrators can record invoice payments" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { invoiceId, costPaymentId, amountPaid, paidDate } = body;

    if (!invoiceId || !costPaymentId || !amountPaid || !paidDate) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: invoiceId, costPaymentId, amountPaid, paidDate",
        },
        { status: 400 },
      );
    }

    // Verify invoice exists
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Verify cost payment exists
    const costPayment = await prisma.costPayment.findUnique({
      where: { id: costPaymentId },
    });

    if (!costPayment) {
      return NextResponse.json(
        { error: "Cost payment not found" },
        { status: 404 },
      );
    }

    // Check for duplicate payment
    const existingPayment = await prisma.invoicePayment.findUnique({
      where: {
        invoiceId_costPaymentId: {
          invoiceId,
          costPaymentId,
        },
      },
    });

    if (existingPayment) {
      return NextResponse.json(
        { error: "Payment already recorded for this invoice and cost payment" },
        { status: 409 },
      );
    }

    const payment = await prisma.invoicePayment.create({
      data: {
        invoiceId,
        costPaymentId,
        amountPaid: parseFloat(amountPaid),
        paidDate: new Date(paidDate),
      },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
          },
        },
        costPayment: true,
      },
    });

    // Check if invoice is now fully paid
    const totalPaid = await prisma.invoicePayment.aggregate({
      where: { invoiceId },
      _sum: { amountPaid: true },
    });

    const invoiceTotalAmount = Number(invoice.totalAmount);
    const totalPaidAmount = Number(totalPaid._sum.amountPaid || 0);

    let newStatus = invoice.status;
    if (totalPaidAmount >= invoiceTotalAmount) {
      newStatus = InvoiceStatus.PAID;
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: newStatus, paidDate: new Date() },
      });
    }

    // Log audit
    await prisma.auditLog.create({
      data: {
        action: AuditAction.PAYMENT_ADDED,
        entityType: "InvoicePayment",
        entityId: payment.id,
        userId,
        description: `Payment of ${amountPaid} recorded for invoice ${invoice.invoiceNumber}`,
        changes: JSON.stringify({
          amountPaid: amountPaid.toString(),
          invoiceId,
          costPaymentId,
          invoiceStatus: newStatus,
        }),
      },
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("Create invoice payment error:", error);
    return NextResponse.json(
      { error: "Failed to record invoice payment" },
      { status: 500 },
    );
  }
}
