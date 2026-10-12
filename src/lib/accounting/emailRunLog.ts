/**
 * Logs single-document emails as email report runs. Bulk Issue & Send writes
 * its own run in the bulk-send-email route; invoice issue, "Send Email" and
 * cancel, and customer-facing memo create and void, each log a one-document
 * run here so every customer email shows up in accounting/email-report.
 */
import { prisma } from "@/lib/prisma";
import type { EmailRunKind } from "@prisma/client";

type Customer = { id: string; name: string | null; email: string };

interface RunOutcome {
  customer: Customer;
  success: boolean;
  error?: string | null;
  ccEmails?: string[] | null;
  userId: string;
}

export interface SingleEmailRunInput extends RunOutcome {
  invoiceId: string;
  invoiceType: string;
  kind: EmailRunKind;
}

export interface MemoEmailRunInput extends RunOutcome {
  // Null when the memo create was rolled back because its email failed.
  memoId: string | null;
  memoNumber: string;
  invoiceId?: string | null;
  kind: "MEMO" | "MEMO_VOID";
}

// Never throws: a failed log must not fail the email action that called it.
async function createSingleRun(
  type: string,
  kind: EmailRunKind,
  document: {
    invoiceId?: string | null;
    memoId?: string | null;
    documentNumber?: string | null;
  },
  outcome: RunOutcome,
  logLabel: string,
): Promise<void> {
  const now = new Date();
  try {
    await prisma.emailSendRun.create({
      data: {
        type,
        kind,
        source: "SINGLE",
        status: "COMPLETED",
        totalInvoices: 1,
        successCount: outcome.success ? 1 : 0,
        failureCount: outcome.success ? 0 : 1,
        createdBy: outcome.userId,
        startedAt: now,
        completedAt: now,
        results: {
          create: {
            invoiceId: document.invoiceId ?? null,
            memoId: document.memoId ?? null,
            documentNumber: document.documentNumber ?? null,
            customerId: outcome.customer.id,
            customerName: outcome.customer.name || "Unknown",
            customerEmail: outcome.customer.email,
            ccEmails: outcome.ccEmails?.length
              ? outcome.ccEmails.join(",")
              : null,
            success: outcome.success,
            errorMessage: outcome.success
              ? null
              : outcome.error || "Unknown error",
            sentAt: outcome.success ? now : null,
          },
        },
      },
    });
  } catch (error) {
    console.error(
      `[EmailReport] Failed to record ${kind} email run for ${logLabel}:`,
      error,
    );
  }
}

/** Record one invoice email (issue, send, cancel) as a single-invoice run. */
export async function recordSingleEmailRun(
  input: SingleEmailRunInput,
): Promise<void> {
  await createSingleRun(
    input.invoiceType,
    input.kind,
    { invoiceId: input.invoiceId },
    input,
    `invoice ${input.invoiceId}`,
  );
}

/** Record one customer-facing memo email (create or void) on the Memos tab. */
export async function recordMemoEmailRun(
  input: MemoEmailRunInput,
): Promise<void> {
  await createSingleRun(
    "MEMO",
    input.kind,
    {
      memoId: input.memoId,
      invoiceId: input.invoiceId,
      documentNumber: input.memoNumber,
    },
    input,
    `memo ${input.memoNumber}`,
  );
}
