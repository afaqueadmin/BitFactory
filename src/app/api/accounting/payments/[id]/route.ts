import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction, InvoiceStatus } from "@prisma/client";
import {
  confirmBankEffectResponse,
  customerBankEffect,
  deleteInvoiceReconciliation,
  deleteReconciliationFiles,
  readConfirm,
} from "@/lib/accounting/invoiceBankEffect";

export async function GET(
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

    // Same gate as the list endpoint - any customer's payment can be read here.
    const requester = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true },
    });
    if (!requester || !isStaffRole(requester.role)) {
      return NextResponse.json(
        { error: "Only administrators can access invoice payments" },
        { status: 403 },
      );
    }

    const payment = await prisma.costPayment.findUnique({
      where: { id },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
            userId: true,
          },
        },
        // Never the whole row - it carries the password hash and 2FA data.
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!payment || payment.isDeleted) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Get cost payment error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cost payment" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    // Same effect as Mark Unpaid on a paid invoice, so the same SUPER_ADMIN rule.
    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only a super admin can delete payments" },
        { status: 403 },
      );
    }

    const payment = await prisma.costPayment.findUnique({
      where: { id },
      include: { invoice: true },
    });

    if (!payment || payment.isDeleted) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Deleting one payment (partial or full) marks a PAID invoice unpaid,
    // which also deletes its Bank Reconciliation entry. When a bank
    // statement changes, the body must carry { confirmBankEffect: true }
    // (decided 2026-11-19). This route has no screen today.
    const invoice = payment.invoice;
    const unpaying = invoice?.status === InvoiceStatus.PAID;
    if (!(await readConfirm(request)) && invoice) {
      const effect = await customerBankEffect(prisma, invoice.id, {
        includeMemo: true,
        paymentId: id,
        withReconciliation: unpaying,
      });
      if (effect.rows.length > 0) return confirmBankEffectResponse(effect);
    }

    const invoiceNumber = invoice?.invoiceNumber || "N/A";
    let fileKeys: string[] = [];
    await prisma.$transaction(async (tx) => {
      await tx.costPayment.update({
        where: { id },
        data: { isDeleted: true },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.PAYMENT_REMOVED,
          entityType: "CostPayment",
          entityId: id,
          userId,
          description: `Payment removed from invoice ${invoiceNumber}`,
          changes: JSON.stringify({
            amount: payment.amount.toString(),
            invoiceId: payment.invoiceId,
            bankId: payment.bankId,
          }),
        },
      });

      if (invoice && unpaying) {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status: InvoiceStatus.ISSUED,
            paidDate: null,
            updatedBy: userId,
          },
        });
        await tx.auditLog.create({
          data: {
            action: AuditAction.INVOICE_UPDATED,
            entityType: "Invoice",
            entityId: invoice.id,
            userId,
            description: `Invoice ${invoiceNumber} marked as unpaid (a payment was deleted)`,
            changes: JSON.stringify({
              status: { from: InvoiceStatus.PAID, to: InvoiceStatus.ISSUED },
              paidDate: {
                from: invoice.paidDate?.toISOString() ?? null,
                to: null,
              },
              removedPaymentIds: [id],
            }),
          },
        });
        fileKeys = await deleteInvoiceReconciliation(
          tx,
          invoice.id,
          userId,
          `a payment of invoice ${invoiceNumber} was deleted and the invoice marked as unpaid`,
        );
      }
    });
    await deleteReconciliationFiles(fileKeys);

    return NextResponse.json({
      success: true,
      message: unpaying
        ? `Payment deleted; invoice ${invoiceNumber} marked as unpaid`
        : "Payment deleted",
    });
  } catch (error) {
    console.error("Delete cost payment error:", error);
    return NextResponse.json(
      { error: "Failed to delete cost payment" },
      { status: 500 },
    );
  }
}
