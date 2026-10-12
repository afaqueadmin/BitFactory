/**
 * Email send reports (EmailSendRun / EmailSendResult): labels and links
 * shared by the report pages and APIs. Client-safe (no prisma import).
 */

/** Invoice types that have an email report tab, in tab order. */
export const EMAIL_REPORT_TYPES = [
  "ELECTRICITY_CHARGES",
  "HARDWARE_SALES",
  "HARDWARE_REPAIR",
] as const;

export const EMAIL_REPORT_TYPE_LABELS: Record<string, string> = {
  ELECTRICITY_CHARGES: "Hosting & Colocation",
  HARDWARE_SALES: "Hardware Sales",
  HARDWARE_REPAIR: "Hardware Repair",
  HARDWARE_PURCHASE: "Hardware Purchase",
};

export const EMAIL_RUN_KIND_LABELS: Record<string, string> = {
  INVOICE: "Invoice",
  CANCELLATION: "Cancellation",
};

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
