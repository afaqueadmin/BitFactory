import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import { vendorPaymentInclude } from "@/lib/accounting/vendorInvoiceRules";
import {
  parseVendorPayment,
  RecordVendorPaymentRequest,
} from "@/lib/accounting/vendorPayment";

/** Records the payment of a Pending hardware purchase invoice and marks it Paid. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const invoice = await prisma.hardwarePurchaseInvoice.findUnique({
      where: { id },
    });
    if (!invoice) {
      return NextResponse.json(
        { error: "Hardware purchase invoice not found" },
        { status: 404 },
      );
    }
    if (invoice.paymentStatus !== "Pending") {
      return NextResponse.json(
        {
          error: `Cannot record payment for a ${invoice.paymentStatus.toLowerCase()} invoice`,
        },
        { status: 400 },
      );
    }

    const body: RecordVendorPaymentRequest = await request.json();
    const parsed = await parseVendorPayment(
      body,
      invoice.totalAmount,
      "hardware-purchase-receipt",
    );
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // Only a still-Pending invoice is updated, so two concurrent submits
    // can't both record a payment.
    const { count } = await prisma.hardwarePurchaseInvoice.updateMany({
      where: { id, paymentStatus: "Pending" },
      data: { ...parsed.data, updatedBy: userId },
    });
    if (count === 0) {
      return NextResponse.json(
        {
          error:
            "This invoice was updated by someone else. Reload and try again.",
        },
        { status: 409 },
      );
    }

    const { data } = parsed;
    await prisma.auditLog.create({
      data: {
        action: AuditAction.HARDWARE_PURCHASE_INVOICE_PAID,
        entityType: "HardwarePurchaseInvoice",
        entityId: id,
        userId,
        description: `Payment of ${data.paymentAmount.toFixed(2)} recorded for hardware purchase invoice ${invoice.invoiceNumber}`,
        changes: JSON.stringify({
          paidDate: data.paidDate,
          entityId: data.paymentEntityId,
          bankId: data.paymentBankId,
          currencyId: data.paymentCurrencyId,
          paymentAmount: data.paymentAmount.toString(),
          exchangeRate: data.paymentExchangeRate.toString(),
          paymentAmountUsd: data.paymentAmountUsd.toString(),
          transactionFee: data.transactionFee.toString(),
          paymentReceiptKey: data.paymentReceiptKey,
        }),
      },
    });

    const updated = await prisma.hardwarePurchaseInvoice.findUnique({
      where: { id },
      include: {
        ...vendorPaymentInclude,
        createdByUser: { select: { id: true, email: true, name: true } },
        updatedByUser: { select: { id: true, email: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error recording hardware purchase payment:", error);
    return NextResponse.json(
      { error: "Failed to record payment" },
      { status: 500 },
    );
  }
}
