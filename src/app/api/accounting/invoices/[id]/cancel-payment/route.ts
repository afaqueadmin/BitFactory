import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { InvoiceStatus, AuditAction } from "@prisma/client";

class CancelPaymentError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * POST /api/accounting/invoices/[id]/cancel-payment
 *
 * Reverses every payment recorded against an invoice (partial, exact or
 * overpaid): voids (soft-deletes) its cost payments, sets the invoice back to
 * ISSUED and clears its paid date, whatever its current status. Memo-created
 * payments are left alone - they are reversed by voiding the memo.
 * Restricted to SUPER_ADMIN.
 */
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

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only super administrators can cancel payments" },
        { status: 403 },
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { invoiceNumber: true, status: true, paidDate: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      return NextResponse.json(
        { error: "Cannot cancel payments on a cancelled invoice" },
        { status: 400 },
      );
    }

    const totalReversed = await prisma.$transaction(async (tx) => {
      const payments = await tx.costPayment.findMany({
        where: { invoiceId: id, isDeleted: false, memoId: null },
        select: {
          id: true,
          amount: true,
          originalAmount: true,
          paymentDate: true,
          type: true,
        },
      });

      if (payments.length === 0) {
        throw new CancelPaymentError("No payments to cancel", 400);
      }

      const ids = payments.map((p) => p.id);
      const total = payments.reduce((sum, p) => sum + p.amount, 0);

      // Guard on the ids still being active so a concurrent cancel/delete
      // can't double-log the reversal.
      const voided = await tx.costPayment.updateMany({
        where: { id: { in: ids }, isDeleted: false },
        data: { isDeleted: true },
      });
      if (voided.count !== ids.length) {
        throw new CancelPaymentError(
          "Payments changed, please reload and try again",
          409,
        );
      }

      await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.ISSUED,
          paidDate: null,
          updatedBy: userId,
        },
      });

      // One PAYMENT_REMOVED entry per payment, matching DELETE /api/accounting/payments/[id]
      await tx.auditLog.createMany({
        data: payments.map((p) => ({
          action: AuditAction.PAYMENT_REMOVED,
          entityType: "CostPayment",
          entityId: p.id,
          userId,
          description: `Payment reversed on invoice ${invoice.invoiceNumber} (payment cancelled)`,
          changes: JSON.stringify({
            amount: p.amount.toString(),
            originalAmount: p.originalAmount?.toString() ?? null,
            paymentDate: p.paymentDate?.toISOString() ?? null,
            type: p.type,
            invoiceId: id,
          }),
        })),
      });

      // Invoice-level entry so the reversal shows in the invoice's audit trail
      await tx.auditLog.create({
        data: {
          action: AuditAction.PAYMENT_REMOVED,
          entityType: "Invoice",
          entityId: id,
          userId,
          description: `Payment reversed: $${total.toFixed(2)} cancelled on invoice ${invoice.invoiceNumber}`,
          changes: JSON.stringify({
            status: { from: invoice.status, to: InvoiceStatus.ISSUED },
            paidDate: {
              from: invoice.paidDate?.toISOString() ?? null,
              to: null,
            },
            reversedPaymentIds: ids,
            totalReversed: total.toFixed(2),
          }),
        },
      });

      return total;
    });

    return NextResponse.json({
      success: true,
      message: `Payments of $${totalReversed.toFixed(2)} cancelled on invoice ${invoice.invoiceNumber}`,
      status: InvoiceStatus.ISSUED,
    });
  } catch (error) {
    if (error instanceof CancelPaymentError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Cancel invoice payment error:", error);
    return NextResponse.json(
      { error: "Failed to cancel payment" },
      { status: 500 },
    );
  }
}
