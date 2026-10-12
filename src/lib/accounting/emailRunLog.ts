/**
 * Logs single-invoice emails as email report runs. Bulk Issue & Send writes
 * its own run in the bulk-send-email route; issue, "Send Email" and cancel
 * each log a one-invoice run here so every invoice email shows up in
 * accounting/email-report.
 */
import { prisma } from "@/lib/prisma";
import type { EmailRunKind } from "@prisma/client";

export interface SingleEmailRunInput {
  invoiceId: string;
  invoiceType: string;
  customer: { id: string; name: string | null; email: string };
  kind: EmailRunKind;
  success: boolean;
  error?: string | null;
  ccEmails?: string[] | null;
  userId: string;
}

/**
 * Record one invoice email as a completed single-invoice run. Never throws:
 * a failed log must not fail the email action that called it.
 */
export async function recordSingleEmailRun(
  input: SingleEmailRunInput,
): Promise<void> {
  const now = new Date();
  try {
    await prisma.emailSendRun.create({
      data: {
        type: input.invoiceType,
        kind: input.kind,
        source: "SINGLE",
        status: "COMPLETED",
        totalInvoices: 1,
        successCount: input.success ? 1 : 0,
        failureCount: input.success ? 0 : 1,
        createdBy: input.userId,
        startedAt: now,
        completedAt: now,
        results: {
          create: {
            invoiceId: input.invoiceId,
            customerId: input.customer.id,
            customerName: input.customer.name || "Unknown",
            customerEmail: input.customer.email,
            ccEmails: input.ccEmails?.length ? input.ccEmails.join(",") : null,
            success: input.success,
            errorMessage: input.success ? null : input.error || "Unknown error",
            sentAt: input.success ? now : null,
          },
        },
      },
    });
  } catch (error) {
    console.error(
      `[EmailReport] Failed to record ${input.kind} email run for invoice ${input.invoiceId}:`,
      error,
    );
  }
}
