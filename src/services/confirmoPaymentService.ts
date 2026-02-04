import { prisma } from "@/lib/prisma";
import { ConfirmoClient } from "@/lib/confirmo/client";
import { Prisma, ConfirmoPaymentStatus } from "@/generated/prisma";

export class ConfirmoPaymentService {
  private client: ConfirmoClient;

  constructor() {
    this.client = new ConfirmoClient();
  }

  /**
   * Create Confirmo payment link for an invoice
   * Called AFTER invoice is created through the form
   *
   * Invoice data comes from the create form:
   * - userId: Selected customer from dropdown
   * - totalMiners: Number entered in form
   * - unitPrice: Price entered in form
   * - totalAmount: Auto-calculated (totalMiners × unitPrice)
   */
  async createPaymentForInvoice(invoiceId: string, createdBy: string) {
    // 1. Fetch invoice with all data from form
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        confirmoPayment: true,
      },
    });

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    if (invoice.status === "PAID") {
      throw new Error("Invoice already paid");
    }

    // Check if payment link already exists and is still valid
    if (invoice.confirmoPayment?.status === "PENDING") {
      const now = new Date();
      if (
        invoice.confirmoPayment.expiresAt &&
        invoice.confirmoPayment.expiresAt > now
      ) {
        return {
          success: true,
          data: invoice.confirmoPayment,
          message: "Payment link already exists",
        };
      }
    }

    // 2. Get Confirmo settings from PaymentDetails
    const paymentDetails = await prisma.paymentDetails.findFirst();

    if (!paymentDetails?.confirmoEnabled) {
      throw new Error(
        "Crypto payment is not enabled. Please contact administrator.",
      );
    }

    // 3. Get admin email from environment
    const adminEmail = process.env.SMTP_USER || "admin@bitfactory.ae";

    // 4. Create Confirmo invoice using form data
    console.log("Creating Confirmo payment with invoice data:", {
      invoiceNumber: invoice.invoiceNumber,
      customer: invoice.user.email,
      totalMiners: invoice.totalMiners,
      unitPrice: invoice.unitPrice.toString(),
      totalAmount: invoice.totalAmount.toString(),
    });

    const confirmoInvoice = await this.client.createInvoice({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.totalAmount.toString(), // Total from form (miners × price)
      totalMiners: invoice.totalMiners, // From form input
      unitPrice: invoice.unitPrice.toString(), // From form input
      settlementCurrency: paymentDetails.confirmoSettlementCurrency || "USDC",
      customerEmail: invoice.user.email, // Customer selected in form
      adminEmail: adminEmail,
    });

    // 5. Save Confirmo payment to database
    const confirmoPayment = await prisma.confirmoPayment.create({
      data: {
        invoiceId: invoice.id,
        confirmoInvoiceId: confirmoInvoice.id,
        paymentUrl: confirmoInvoice.url,
        amount: invoice.totalAmount,
        currency: "USD",
        settlementCurrency: paymentDetails.confirmoSettlementCurrency,
        status: "PENDING",
        customerEmail: invoice.user.email,
        notifyEmail: adminEmail,
        reference: invoice.invoiceNumber,
        expiresAt: confirmoInvoice.expiresAt
          ? new Date(confirmoInvoice.expiresAt)
          : null,
      },
    });

    // 6. Create audit log
    await prisma.auditLog.create({
      data: {
        action: "INVOICE_UPDATED",
        entityType: "ConfirmoPayment",
        entityId: confirmoPayment.id,
        userId: createdBy,
        description: `Crypto payment link created for invoice ${invoice.invoiceNumber}`,
        changes: {
          paymentUrl: confirmoInvoice.url,
          amount: invoice.totalAmount.toString(),
          miners: invoice.totalMiners,
          unitPrice: invoice.unitPrice.toString(),
          customer: invoice.user.email,
        },
      },
    });

    console.log("Confirmo payment created successfully:", {
      confirmoInvoiceId: confirmoInvoice.id,
      paymentUrl: confirmoInvoice.url,
    });

    return {
      success: true,
      data: confirmoPayment,
      message: "Payment link created successfully",
    };
  }

  /**
   * Handle webhook from Confirmo when payment status changes
   */
  async handleWebhook(webhookData: Record<string, unknown>) {
    const {
      id: confirmoInvoiceId,
      status,
      paid_amount,
      paid_currency,
      tx_hash,
      settled_amount,
      settled_currency,
    } = webhookData;

    console.log("Processing Confirmo webhook:", {
      confirmoInvoiceId,
      status,
      paid_amount,
      paid_currency,
    });

    // Validate required fields
    if (typeof confirmoInvoiceId !== "string") {
      throw new Error(
        "Invalid webhook data: confirmoInvoiceId must be a string",
      );
    }

    if (typeof status !== "string") {
      throw new Error("Invalid webhook data: status must be a string");
    }

    // Find payment record
    const confirmoPayment = await prisma.confirmoPayment.findUnique({
      where: { confirmoInvoiceId },
      include: {
        invoice: {
          include: { user: true },
        },
      },
    });

    if (!confirmoPayment) {
      throw new Error(
        `Payment not found for Confirmo invoice: ${confirmoInvoiceId}`,
      );
    }

    // Update payment status
    const updates: Prisma.ConfirmoPaymentUpdateInput = {
      status: this.mapConfirmoStatus(status),
      updatedAt: new Date(),
    };

    if (paid_amount && typeof paid_amount === "number") {
      updates.paidAmount = new Prisma.Decimal(paid_amount);
    }
    if (paid_currency && typeof paid_currency === "string") {
      updates.paidCurrency = paid_currency;
    }
    if (tx_hash && typeof tx_hash === "string") {
      updates.transactionHash = tx_hash;
    }
    if (status === "confirmed") {
      updates.confirmedAt = new Date();
    }

    const updatedPayment = await prisma.confirmoPayment.update({
      where: { id: confirmoPayment.id },
      data: updates,
      include: {
        invoice: {
          include: { user: true },
        },
      },
    });

    // If payment confirmed, mark invoice as paid
    if (status === "confirmed" && updatedPayment.invoice.status !== "PAID") {
      console.log("Payment confirmed, updating invoice status to PAID");

      await prisma.$transaction([
        // Update invoice status
        prisma.invoice.update({
          where: { id: updatedPayment.invoiceId },
          data: {
            status: "PAID",
            paidDate: new Date(),
          },
        }),

        // Create cost payment record (links to existing payment system)
        prisma.costPayment.create({
          data: {
            userId: updatedPayment.invoice.userId,
            invoiceId: updatedPayment.invoiceId,
            amount: parseFloat(updatedPayment.amount.toString()),
            consumption: 0, // Consumption tracked separately
            type: "PAYMENT",
            narration: `Crypto payment - ${typeof paid_currency === "string" ? paid_currency : "Crypto"} - ${updatedPayment.invoice.totalMiners} miners @ $${updatedPayment.invoice.unitPrice}/miner${typeof tx_hash === "string" ? ` (Tx: ${tx_hash.slice(0, 16)}...)` : ""}`,
          },
        }),

        // Audit log
        prisma.auditLog.create({
          data: {
            action: "INVOICE_PAID",
            entityType: "Invoice",
            entityId: updatedPayment.invoiceId,
            userId: updatedPayment.invoice.userId,
            description: `Invoice ${updatedPayment.invoice.invoiceNumber} paid via crypto`,
            changes: {
              status: { from: updatedPayment.invoice.status, to: "PAID" },
              paidAmount: typeof paid_amount === "number" ? paid_amount : null,
              currency:
                typeof paid_currency === "string" ? paid_currency : null,
              txHash: typeof tx_hash === "string" ? tx_hash : null,
              settledAmount:
                typeof settled_amount === "number" ? settled_amount : null,
              settledCurrency:
                typeof settled_currency === "string" ? settled_currency : null,
              invoiceDetails: {
                miners: updatedPayment.invoice.totalMiners,
                unitPrice: updatedPayment.invoice.unitPrice.toString(),
                totalAmount: updatedPayment.amount.toString(),
              },
            },
          },
        }),
      ]);

      console.log(
        "Invoice marked as paid:",
        updatedPayment.invoice.invoiceNumber,
      );

      // Send payment confirmation email
      await this.sendPaymentConfirmationEmail(updatedPayment);
    }

    return updatedPayment;
  }

  private async sendPaymentConfirmationEmail(confirmoPayment: {
    customerEmail: string | null;
    notifyEmail: string | null;
  }) {
    // TODO: Implement email notification
    console.log("Sending payment confirmation emails to:", {
      customer: confirmoPayment.customerEmail,
      admin: confirmoPayment.notifyEmail,
      cc: process.env.CC_INVOICES_EMAIL,
    });
  }

  private mapConfirmoStatus(confirmoStatus: string): ConfirmoPaymentStatus {
    const statusMap: Record<string, ConfirmoPaymentStatus> = {
      pending: ConfirmoPaymentStatus.PENDING,
      processing: ConfirmoPaymentStatus.PROCESSING,
      confirmed: ConfirmoPaymentStatus.CONFIRMED,
      completed: ConfirmoPaymentStatus.COMPLETED,
      expired: ConfirmoPaymentStatus.EXPIRED,
      cancelled: ConfirmoPaymentStatus.CANCELLED,
      failed: ConfirmoPaymentStatus.FAILED,
    };
    return (
      statusMap[confirmoStatus.toLowerCase()] || ConfirmoPaymentStatus.PENDING
    );
  }
}
