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
      prisma.costPayment.findMany({
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
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.costPayment.count({ where }),
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
    const { invoiceId, costPaymentId } = body;

    if (!invoiceId || !costPaymentId) {
      return NextResponse.json(
        {
          error: "Missing required fields: invoiceId, costPaymentId",
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

    // Verify cost payment exists and not already linked
    const costPayment = await prisma.costPayment.findUnique({
      where: { id: costPaymentId },
    });

    if (!costPayment) {
      return NextResponse.json(
        { error: "Cost payment not found" },
        { status: 404 },
      );
    }

    if (costPayment.invoiceId) {
      return NextResponse.json(
        { error: "Cost payment is already linked to an invoice" },
        { status: 409 },
      );
    }

    // Update cost payment with invoice ID
    const payment = await prisma.costPayment.update({
      where: { id: costPaymentId },
      data: { invoiceId },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
          },
        },
      },
    });

    // Check if invoice is now fully paid
    const totalPaid = await prisma.costPayment.aggregate({
      where: { invoiceId },
      _sum: { amount: true },
    });

    const invoiceTotalAmount = Number(invoice.totalAmount);
    const totalPaidAmount = Number(totalPaid._sum.amount || 0);

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
        entityType: "CostPayment",
        entityId: payment.id,
        userId,
        description: `Payment of $${payment.amount.toFixed(2)} linked to invoice ${invoice.invoiceNumber}`,
        changes: JSON.stringify({
          amount: payment.amount.toString(),
          invoiceId,
          invoiceStatus: newStatus,
        }),
      },
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("Link cost payment to invoice error:", error);
    return NextResponse.json(
      { error: "Failed to link cost payment to invoice" },
      { status: 500 },
    );
  }
}
