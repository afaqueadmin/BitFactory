import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction, InvoiceStatus } from "@/generated/prisma";

export async function POST(
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
        { error: "Only administrators can record payments" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { amountPaid, paymentDate, notes, markAsPaid } = body;

    // Validate input
    if (!markAsPaid && (!amountPaid || amountPaid <= 0)) {
      return NextResponse.json(
        { error: "Amount paid must be greater than 0" },
        { status: 400 },
      );
    }

    if (!paymentDate) {
      return NextResponse.json(
        { error: "Payment date is required" },
        { status: 400 },
      );
    }

    // Get invoice
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        costPayments: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Validate invoice can accept payment
    if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
      return NextResponse.json(
        {
          error: `Cannot record payment for ${invoice.status.toLowerCase()} invoices`,
        },
        { status: 400 },
      );
    }

    // Calculate outstanding balance (allow overpayment for admins)
    const totalPaid = invoice.costPayments.reduce(
      (sum, p) => sum + p.amount,
      0,
    );
    const outstanding = Number(invoice.totalAmount) - totalPaid;

    // Create cost payment entry with invoiceId (this replaces the old InvoicePayment table)
    const costPayment = await prisma.costPayment.create({
      data: {
        userId: invoice.userId,
        invoiceId: id,
        amount: amountPaid,
        type: "PAYMENT",
        consumption: 0,
        narration: notes || null,
      },
    });

    // Calculate new total paid amount
    const newTotalPaid = totalPaid + amountPaid;
    const remainingBalance = Number(invoice.totalAmount) - newTotalPaid;

    // Update invoice status if fully paid
    if (markAsPaid || remainingBalance <= 0.0) {
      // Fully paid (accounting for floating point)
      await prisma.invoice.update({
        where: { id },
        data: {
          status: "PAID",
          paidDate: new Date(paymentDate),
        },
      });
    }

    // Log audit entry
    await prisma.auditLog.create({
      data: {
        action: AuditAction.PAYMENT_ADDED,
        entityType: "Invoice",
        entityId: id,
        userId,
        description: `Payment of $${amountPaid.toFixed(2)} recorded for invoice ${invoice.invoiceNumber}`,
        changes: JSON.stringify({
          amountPaid,
          paymentDate,
          costPaymentId: costPayment.id,
          isPaid: Math.abs(remainingBalance) < 0.01,
          remainingBalance: remainingBalance.toFixed(2),
        }),
      },
    });

    // Fetch and return updated invoice with all payments
    const finalInvoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        costPayments: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(finalInvoice);
  } catch (error) {
    console.error("Record payment error:", error);
    return NextResponse.json(
      { error: "Failed to record payment" },
      { status: 500 },
    );
  }
}
