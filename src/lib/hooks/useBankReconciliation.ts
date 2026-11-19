import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Bank Reconciliation. Query keys sit under "paymentAccounts" so a saved
 * entry also refreshes bank balances and statements, and the other way round.
 */

const ROOT_KEY = "paymentAccounts";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Request failed");
  return body.data as T;
}

export interface ReconciliationFile {
  key: string;
  fileName: string;
  href: string;
}

export interface ReconciliationEntry {
  id: string;
  /** Running number; entryLabel is it as shown ("REC-0001"). */
  entryNumber: number;
  entryLabel: string;
  /** YYYY-MM-DD. */
  date: string;
  invoiceId: string;
  invoiceNumber: string;
  /** ELECTRICITY_CHARGES | HARDWARE_SALES | HARDWARE_REPAIR. */
  invoiceType: string;
  /** Admin page of the invoice. */
  invoiceHref: string;
  invoiceTotalUsd: string;
  clientName: string;
  entityId: string;
  entityName: string;
  bankId: string;
  bankName: string;
  bankActive: boolean;
  currencyId: string;
  currencyCode: string;
  /** 1 USD = X currency. */
  exchangeRate: string;
  /** In the bank's currency. */
  amount: string;
  fee: string;
  amountUsd: string;
  feeUsd: string;
  narration: string | null;
  pdf: ReconciliationFile | null;
  sheet: ReconciliationFile | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** An invoice the dropdown offers. */
export interface ReconciliationInvoice {
  id: string;
  invoiceNumber: string;
  clientName: string;
  totalUsd: string;
  /** ISO instant, or null when the invoice has no paid date saved. */
  paidDate: string | null;
  /** The invoice's payment notes, joined. */
  narration: string;
}

/** What the Add / Edit form sends. */
export interface ReconciliationInput {
  date: string;
  invoiceType: string;
  invoiceId: string;
  entityId: string;
  bankId: string;
  currencyId: string;
  exchangeRate: string;
  amount: string;
  fee: string;
  narration: string;
  pdf: { key: string; fileName: string } | null;
  sheet: { key: string; fileName: string } | null;
  /** Browser time zone, for the "not in the future" date rule. */
  tz: string;
}

export function useBankReconciliation() {
  return useQuery({
    queryKey: [ROOT_KEY, "bankReconciliation"],
    queryFn: () =>
      request<ReconciliationEntry[]>("/api/accounting/bank-reconciliation"),
  });
}

/** Invoices of one type that can be reconciled (plus `keep` when editing). */
export function useReconciliationInvoices(type: string, keep?: string) {
  const params = new URLSearchParams({ type });
  if (keep) params.set("keep", keep);
  return useQuery({
    queryKey: [ROOT_KEY, "bankReconciliationInvoices", type, keep ?? ""],
    queryFn: () =>
      request<ReconciliationInvoice[]>(
        `/api/accounting/bank-reconciliation/invoices?${params.toString()}`,
      ),
    enabled: !!type,
  });
}

/** Add (no id), edit or delete an entry. Refreshes balances and statements. */
export function useSaveReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      method,
      data,
    }: {
      id?: string;
      method: "POST" | "PUT" | "DELETE";
      data?: ReconciliationInput;
    }) =>
      request<unknown>(
        `/api/accounting/bank-reconciliation${id ? `/${id}` : ""}`,
        {
          method,
          body: data ? JSON.stringify(data) : undefined,
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROOT_KEY] });
    },
  });
}
