import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction, InvoiceStatus } from "@prisma/client";

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
    const {
      amountPaid,
      paymentDate,
      notes,
      hostingAmountPaid,
      hostingNotes,
      markAsPaid,
    } = body;

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
        lineItems: true,
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

    // Hardware-sales invoices that also bill first-month Hosting & Colocation
    // record two separate CostPayment entries (Hardware Sales Payment +
    // Hosting and Colocation Payment). Invoices without a hosting line item
    // (including every invoice created before this feature) keep the
    // original single "Amount Paid" behavior untouched.
    const hasHosting = invoice.lineItems.some(
      (li) => li.lineItemType === "HOSTING_COLOCATION",
    );

    const hardwareAmount = Number(amountPaid) || 0;
    const hostingAmount = hasHosting ? Number(hostingAmountPaid) || 0 : 0;

    if (hasHosting) {
      if (!markAsPaid && hardwareAmount <= 0 && hostingAmount <= 0) {
        return NextResponse.json(
          {
            error:
              "Enter a Hardware Sales Payment amount and/or a Hosting and Colocation Payment amount greater than 0",
          },
          { status: 400 },
        );
      }
    } else if (!markAsPaid && hardwareAmount <= 0) {
      return NextResponse.json(
        { error: "Amount paid must be greater than 0" },
        { status: 400 },
      );
    }

    // Calculate outstanding balance (allow overpayment for admins)
    const totalPaid = invoice.costPayments.reduce(
      (sum, p) => sum + p.amount,
      0,
    );

    // Create cost payment entries with invoiceId (this replaces the old InvoicePayment table)
    const costPaymentIds: string[] = [];

    if (!hasHosting || hardwareAmount > 0 || markAsPaid) {
      const hardwarePayment = await prisma.costPayment.create({
        data: {
          userId: invoice.userId,
          invoiceId: id,
          amount: hardwareAmount,
          type:
            invoice.invoiceType === "HARDWARE_SALES"
              ? "HARDWARE_SALES"
              : "PAYMENT",
          consumption: 0,
          narration: notes || null,
        },
      });
      costPaymentIds.push(hardwarePayment.id);
    }

    if (hasHosting && (hostingAmount > 0 || markAsPaid)) {
      const hostingPayment = await prisma.costPayment.create({
        data: {
          userId: invoice.userId,
          invoiceId: id,
          amount: hostingAmount,
          type: "PAYMENT",
          consumption: 0,
          narration: hostingNotes || null,
        },
      });
      costPaymentIds.push(hostingPayment.id);
    }

    // Calculate new total paid amount
    const newTotalPaid = totalPaid + hardwareAmount + hostingAmount;
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
    const totalAmountPaidNow = hardwareAmount + hostingAmount;
    await prisma.auditLog.create({
      data: {
        action: AuditAction.PAYMENT_ADDED,
        entityType: "Invoice",
        entityId: id,
        userId,
        description: `Payment of $${totalAmountPaidNow.toFixed(2)} recorded for invoice ${invoice.invoiceNumber}`,
        changes: JSON.stringify({
          amountPaid: hardwareAmount,
          ...(hasHosting ? { hostingAmountPaid: hostingAmount } : {}),
          paymentDate,
          costPaymentIds,
          isPaid: Math.abs(remainingBalance) < 0.01,
          remainingBalance: remainingBalance.toFixed(2),
        }),
      },
    });

    // Fetch and return updated invoice with all payments. This overwrites
    // the client's cached invoice (["invoice", id]) via setQueryData, so it
    // must include lineItems or the split-payment form loses its
    // hasHosting/isSplitPayment signal after a successful submission.
    const finalInvoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        costPayments: true,
        lineItems: true,
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
