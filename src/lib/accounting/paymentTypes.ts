import type { PaymentType } from "@prisma/client";

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

/** Statement / transaction-table labels for CostPayment types. */
export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  PAYMENT: "Payment",
  ELECTRICITY_CHARGES: "Hosting & electricity charges",
  ADJUSTMENT: "Adjustment",
  HARDWARE_SALES: "Hardware sales payment",
  HARDWARE_REPAIR: "Hardware repair payment",
};

export const paymentTypeLabel = (type: string): string =>
  PAYMENT_TYPE_LABELS[type] ?? type;
