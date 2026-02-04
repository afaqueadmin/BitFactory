export interface ConfirmoInvoiceResponse {
  id: string;
  url: string;
  expiresAt?: string;
  status: string;
  amount: string;
  currency: string;
  settlementCurrency?: string;
  reference: string;
}

export interface ConfirmoWebhookPayload {
  id: string;
  status: string;
  paid_amount?: string;
  paid_currency?: string;
  tx_hash?: string;
  settled_amount?: string;
  settled_currency?: string;
  reference: string;
}

export type ConfirmoPaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "CONFIRMED"
  | "COMPLETED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED";
