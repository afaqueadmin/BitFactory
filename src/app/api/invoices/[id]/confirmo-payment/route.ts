import { NextRequest, NextResponse } from "next/server";
import { ConfirmoPaymentService } from "@/services/confirmoPaymentService";
import { rejectReadOnly } from "@/lib/guildScope";
import { getInvoiceForPayer } from "@/lib/accounting/invoicePayerAccess";
import { prisma } from "@/lib/prisma";

// Both handlers: only the invoice's customer, the customer's franchisee, or
// staff with invoicing.view (getInvoiceForPayer, same as the Binance routes).

/**
 * POST /api/invoices/[id]/confirmo-payment
 *
 * Called when:
 * 1. Admin clicks "Generate Payment Link" button after creating invoice
 * 2. Customer clicks "Pay with Crypto" in email or invoice page
 *
 * Uses invoice data that was entered in the create form:
 * - Customer (userId)
 * - Number of miners (totalMiners)
 * - Unit price (unitPrice)
 * - Total amount (totalAmount)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const access = await getInvoiceForPayer(request, id);
    if ("error" in access) return access.error;
    const readOnly = rejectReadOnly(access.role);
    if (readOnly) return readOnly;

    console.log("Creating Confirmo payment for invoice:", id);

    const service = new ConfirmoPaymentService();
    const result = await service.createPaymentForInvoice(id, access.userId);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Error creating Confirmo payment:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to create payment link",
      },
      { status: 400 },
    );
  }
}

/**
 * GET /api/invoices/[id]/confirmo-payment
 *
 * Get existing payment status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const access = await getInvoiceForPayer(request, id);
    if ("error" in access) return access.error;

    const payment = await prisma.confirmoPayment.findUnique({
      where: { invoiceId: id },
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            totalAmount: true,
            totalMiners: true,
            unitPrice: true,
            status: true,
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json(
        { success: false, error: "Payment link not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: payment,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Error fetching payment status:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 },
    );
  }
}
