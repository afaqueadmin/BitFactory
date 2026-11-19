import { useQuery } from "@tanstack/react-query";

/**
 * What an unpaid action would remove from the bank statements, read from the
 * GET of its route (mark-unpaid / cancel-payment) before the user confirms.
 * Shape: lib/accounting/invoiceBankEffect.ts.
 */

export interface BankEffectRow {
  label: string;
  bankName: string;
  side: "DEBIT" | "CREDIT";
  amountUsd: string;
  /** YYYY-MM-DD, or null. */
  date: string | null;
}

export interface BankEffect {
  rows: BankEffectRow[];
  paymentCount: number;
  reconciliation: { id: string; entryLabel: string } | null;
  otherInvoices: string[];
}

export async function fetchBankEffect(url: string): Promise<BankEffect> {
  const res = await fetch(url, { credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || "Failed to load the bank statement effect");
  }
  return body.data as BankEffect;
}

/** `url` null = not loaded (e.g. the dialog is closed). */
export function useBankEffect(url: string | null) {
  return useQuery({
    queryKey: ["bankEffect", url],
    queryFn: () => fetchBankEffect(url as string),
    enabled: !!url,
    staleTime: 0,
    gcTime: 0,
  });
}

/** POST body that confirms the bank statement change. */
export const CONFIRM_BANK_EFFECT = JSON.stringify({ confirmBankEffect: true });
