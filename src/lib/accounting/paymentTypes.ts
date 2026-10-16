import type { InvoiceType, PaymentType } from "@prisma/client";

/**
 * CostPayment types recorded against hardware invoices. They are shown on
 * statements for reference only and are kept OUT of the customer's running
 * hosting balance (which is PAYMENT + ELECTRICITY_CHARGES + ADJUSTMENT).
 *
 * Use as `type: { notIn: NON_BALANCE_PAYMENT_TYPES }` in balance queries.
 */
export const NON_BALANCE_PAYMENT_TYPES: PaymentType[] = [
  "HARDWARE_SALES",
  "HARDWARE_REPAIR",
];

export const isNonBalancePaymentType = (type: string): boolean =>
  (NON_BALANCE_PAYMENT_TYPES as string[]).includes(type);

/**
 * CostPayment type for a payment received against an invoice: hardware
 * invoices keep their own type (out of the hosting balance), everything
 * else is a hosting PAYMENT.
 */
export const paymentTypeForInvoice = (
  invoiceType: InvoiceType | string,
): PaymentType =>
  invoiceType === "HARDWARE_SALES"
    ? "HARDWARE_SALES"
    : invoiceType === "HARDWARE_REPAIR"
      ? "HARDWARE_REPAIR"
      : "PAYMENT";

/** Statement / transaction-table labels for CostPayment types. */
export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  PAYMENT: "Payment",
  ELECTRICITY_CHARGES: "Hosting & Colocation",
  ADJUSTMENT: "Adjustment",
  HARDWARE_SALES: "Hardware Procurement",
  HARDWARE_REPAIR: "Hardware Repair",
};

export const paymentTypeLabel = (type: string): string =>
  PAYMENT_TYPE_LABELS[type] ?? type;
