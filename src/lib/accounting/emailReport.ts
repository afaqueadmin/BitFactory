/**
 * Email send reports (EmailSendRun / EmailSendResult): labels and links
 * shared by the report pages and APIs. Client-safe (no prisma import).
 */

/**
 * Run types that have an email report tab, in tab order: the invoice types,
 * plus MEMO for customer-facing memo create/void emails.
 */
export const EMAIL_REPORT_TYPES = [
  "ELECTRICITY_CHARGES",
  "HARDWARE_SALES",
  "HARDWARE_REPAIR",
  "MEMO",
] as const;

export const EMAIL_REPORT_TYPE_LABELS: Record<string, string> = {
  ELECTRICITY_CHARGES: "Hosting & Colocation",
  HARDWARE_SALES: "Hardware Sales",
  HARDWARE_REPAIR: "Hardware Repair",
  HARDWARE_PURCHASE: "Hardware Purchase",
  MEMO: "Memos",
};

export const MEMO_CATEGORY_LABELS: Record<string, string> = {
  HOSTING: "Hosting & Colocation",
  HARDWARE: "Hardware Sales",
};

export const EMAIL_RUN_KIND_LABELS: Record<string, string> = {
  INVOICE: "Invoice",
  CANCELLATION: "Cancellation",
  MEMO: "Memo",
  MEMO_VOID: "Memo Void",
};

/** Kinds whose emails are invoice PDFs and so can be resent from a report. */
export function canResendKind(kind: string): boolean {
  return kind === "INVOICE";
}

export const EMAIL_RUN_SOURCE_LABELS: Record<string, string> = {
  BULK: "Bulk",
  SINGLE: "Single",
};

export function emailReportTypeLabel(type: string): string {
  return EMAIL_REPORT_TYPE_LABELS[type] ?? type;
}

/** Admin detail page for an invoice of the given type. */
export function invoiceDetailHref(
  invoiceId: string,
  invoiceType: string | null | undefined,
): string {
  if (invoiceType === "HARDWARE_SALES") {
    return `/accounting/hardware-sales/${invoiceId}`;
  }
  if (invoiceType === "HARDWARE_REPAIR") {
    return `/accounting/hardware-repair/${invoiceId}`;
  }
  return `/accounting/${invoiceId}`;
}

/** Memos list filtered to the memo's customer (the page has no detail view). */
export function memoHref(customerId: string): string {
  return `/accounting/memos?customerId=${encodeURIComponent(customerId)}`;
}
