import { prisma } from "@/lib/prisma";
import { generateInvoicePDF, sendInvoiceEmailWithPDF } from "@/lib/email";
import { getGroupBySubaccountName } from "@/lib/groupUtils";
import { ConfirmoPaymentService } from "./confirmoPaymentService";
import { AuditAction } from "@/generated/prisma";

export interface InvoiceEmailPayload {
  invoiceId: string;
  invoiceNumber: string;
  customerEmail: string;
  customerName: string;
  totalAmount: number;
  issuedDate: Date;
  dueDate: Date;
  totalMiners: number;
  unitPrice: number;
  luxorSubaccountName?: string | null;
  hardwareModel?: string | null;
}

export interface EmailSendResult {
  success: boolean;
  error?: string;
  cryptoPaymentUrl?: string | null;
  ccEmails?: string[];
}

/**
 * Centralized Invoice Email Service
 * Reusable for single invoices, bulk sends, and resends
 * Handles: CC list building, crypto payments, PDF generation, email sending
 */
export class InvoiceEmailService {
  /**
   * Build CC list for invoice email
   * Includes: Relationship Manager (if any) + invoices@bitfactory.ae
   */
  static async buildCCList(
    luxorSubaccountName?: string | null,
  ): Promise<string[]> {
    const ccEmails: string[] = [];

    // Fetch group/RM if available
    if (luxorSubaccountName) {
      try {
        const group = await getGroupBySubaccountName(luxorSubaccountName);
        if (group?.email && !ccEmails.includes(group.email)) {
          ccEmails.push(group.email);
        }
      } catch (error) {
        console.error(
          "[InvoiceEmailService] Error fetching group for CC:",
          error,
        );
        // Continue without RM CC
      }
    }

    // Always add invoices@bitfactory.ae
    const invoiceCCEmail =
      process.env.INVOICE_CC_EMAIL || "invoices@bitfactory.ae";
    if (!ccEmails.includes(invoiceCCEmail)) {
      ccEmails.push(invoiceCCEmail);
    }

    return ccEmails;
  }

  /**
   * Get crypto payment URL if Confirmo is enabled
   */
  static async getCryptoPaymentUrl(
    invoiceId: string,
    userId: string,
  ): Promise<string | null> {
    try {
      const paymentSettings = await prisma.paymentDetails.findFirst();
      if (!paymentSettings?.confirmoEnabled) {
        return null;
      }

      const confirmoService = new ConfirmoPaymentService();
      const result = await confirmoService.createPaymentForInvoice(
        invoiceId,
        userId,
      );

      if (result.success && result.data?.paymentUrl) {
        console.log(
          `[InvoiceEmailService] Crypto payment URL generated for invoice ${invoiceId}:`,
          result.data.paymentUrl,
        );
        return result.data.paymentUrl;
      }

      console.log(
        `[InvoiceEmailService] Crypto payment creation succeeded but no URL:`,
        {
          success: result.success,
          hasData: !!result.data,
          hasUrl: !!result.data?.paymentUrl,
        },
      );
    } catch (error) {
      console.error("[InvoiceEmailService] Crypto payment error:", error);
      // Continue without crypto payment
    }

    return null;
  }

  /**
   * Send invoice email with PDF (core functionality)
   * PDF is MANDATORY - email not sent without it
   *
   * Used by:
   * - Single invoice send
   * - Bulk invoice send
   * - Bulk resend
   */
  static async sendInvoiceWithPDF(
    payload: InvoiceEmailPayload,
    userId: string,
    ccEmails: string[],
    cryptoPaymentUrl: string | null,
  ): Promise<EmailSendResult> {
    try {
      // Step 1: Generate PDF (MANDATORY)
      console.log(
        `[InvoiceEmailService] Generating PDF for invoice ${payload.invoiceNumber}...`,
      );

      const pdfBuffer = await generateInvoicePDF(
        payload.invoiceNumber,
        payload.customerName,
        payload.customerEmail,
        payload.totalAmount,
        payload.issuedDate,
        payload.dueDate,
        payload.totalMiners,
        payload.unitPrice,
        payload.invoiceId,
        new Date(),
        cryptoPaymentUrl,
        payload.hardwareModel as string | null | undefined,
      );

      console.log(
        `[InvoiceEmailService] PDF generated (${pdfBuffer.length} bytes)`,
      );

      // Step 2: Send email with PDF
      console.log(
        `[InvoiceEmailService] Sending email with PDF to ${payload.customerEmail}...`,
      );

      const emailResult = await sendInvoiceEmailWithPDF(
        payload.customerEmail,
        payload.customerName,
        payload.invoiceNumber,
        payload.totalAmount,
        payload.issuedDate,
        payload.dueDate,
        payload.totalMiners,
        payload.unitPrice,
        payload.invoiceId,
        pdfBuffer,
        ccEmails,
        cryptoPaymentUrl,
      );

      if (!emailResult.success) {
        console.error(
          `[InvoiceEmailService] Email send failed for ${payload.invoiceNumber}:`,
          emailResult.error,
        );
        return {
          success: false,
          error: "Email transmission failed",
        };
      }

      console.log(
        `[InvoiceEmailService] Successfully sent invoice ${payload.invoiceNumber} to ${payload.customerEmail}`,
      );

      // Step 3: Create notification record
      await prisma.invoiceNotification.create({
        data: {
          invoiceId: payload.invoiceId,
          notificationType: "INVOICE_ISSUED",
          sentTo: payload.customerEmail,
          sentAt: new Date(),
          status: "SENT",
          ccEmails: ccEmails.join(","),
        },
      });

      // Step 4: Log audit
      await prisma.auditLog.create({
        data: {
          action: AuditAction.INVOICE_SENT_TO_CUSTOMER,
          entityType: "Invoice",
          entityId: payload.invoiceId,
          userId,
          description: `Invoice ${payload.invoiceNumber} sent to ${payload.customerEmail}`,
          changes: JSON.stringify({
            sentTo: payload.customerEmail,
            ccEmails: ccEmails.join(","),
            pdfAttached: true,
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return {
        success: true,
        cryptoPaymentUrl,
        ccEmails,
      };
    } catch (error) {
      console.error(
        `[InvoiceEmailService] Error sending invoice ${payload.invoiceNumber}:`,
        error,
      );

      // Create failed notification
      try {
        await prisma.invoiceNotification.create({
          data: {
            invoiceId: payload.invoiceId,
            notificationType: "INVOICE_ISSUED",
            sentTo: payload.customerEmail,
            sentAt: new Date(),
            status: "FAILED",
            ccEmails: ccEmails.join(","),
          },
        });
      } catch (notificationError) {
        console.error(
          "[InvoiceEmailService] Failed to create notification:",
          notificationError,
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Bulk send to multiple invoices
   * Returns per-invoice results
   */
  static async sendBulkInvoices(
    invoices: InvoiceEmailPayload[],
    userId: string,
  ): Promise<{
    results: Array<{
      invoiceId: string;
      invoiceNumber: string;
      success: boolean;
      error?: string;
    }>;
    summary: {
      total: number;
      successful: number;
      failed: number;
    };
  }> {
    const results = [];
    let successful = 0;
    let failed = 0;

    for (const invoice of invoices) {
      try {
        // Build CC list & get crypto payment simultaneously
        const [ccEmails, cryptoPaymentUrl] = await Promise.all([
          this.buildCCList(invoice.luxorSubaccountName),
          this.getCryptoPaymentUrl(invoice.invoiceId, userId),
        ]);

        // Send email
        const emailResult = await this.sendInvoiceWithPDF(
          invoice,
          userId,
          ccEmails,
          cryptoPaymentUrl,
        );

        if (emailResult.success) {
          successful++;
          results.push({
            invoiceId: invoice.invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            success: true,
          });
        } else {
          failed++;
          results.push({
            invoiceId: invoice.invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            success: false,
            error: emailResult.error,
          });
        }
      } catch (error) {
        failed++;
        results.push({
          invoiceId: invoice.invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      results,
      summary: {
        total: invoices.length,
        successful,
        failed,
      },
    };
  }
}
