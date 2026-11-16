import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Capital & Income. Query keys sit under "paymentAccounts" so a saved entry
 * also refreshes bank balances and statements, and the other way round.
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

export interface IncomeFile {
  key: string;
  fileName: string;
  href: string;
}

export interface IncomeEntry {
  id: string;
  /** Running number; entryLabel is it as shown ("CAP-0001"). */
  entryNumber: number;
  entryLabel: string;
  /** YYYY-MM-DD. */
  date: string;
  head: { id: string; name: string; isActive: boolean };
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
  receivedFrom: string | null;
  narration: string | null;
  pdf: IncomeFile | null;
  sheet: IncomeFile | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** What the Add / Edit form sends. */
export interface IncomeInput {
  date: string;
  headId: string;
  entityId: string;
  bankId: string;
  currencyId: string;
  exchangeRate: string;
  amount: string;
  fee: string;
  receivedFrom: string;
  narration: string;
  pdf: { key: string; fileName: string } | null;
  sheet: { key: string; fileName: string } | null;
  /** Browser time zone, for the "not in the future" date rule. */
  tz: string;
}

export interface IncomeReportCell {
  receivedUsd: string;
  feesUsd: string;
  netUsd: string;
}

export interface IncomeReport {
  range: { from: string | null; to: string | null };
  /** "YYYY-MM", oldest first. */
  months: string[];
  rows: {
    head: string;
    cells: Record<string, IncomeReportCell>;
    total: IncomeReportCell;
  }[];
  totals: Record<string, IncomeReportCell>;
  grandTotal: IncomeReportCell;
}

export function useCapitalIncome() {
  return useQuery({
    queryKey: [ROOT_KEY, "capitalIncome"],
    queryFn: () => request<IncomeEntry[]>("/api/accounting/capital-income"),
  });
}

export function useIncomeReport(from: string, to: string, headId: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (headId) params.set("head", headId);
  return useQuery({
    queryKey: [ROOT_KEY, "capitalIncomeReport", from, to, headId],
    queryFn: () =>
      request<IncomeReport>(
        `/api/accounting/capital-income/report?${params.toString()}`,
      ),
  });
}

/** Add (no id), edit or delete an entry. Refreshes balances and statements. */
export function useSaveIncome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      method,
      data,
    }: {
      id?: string;
      method: "POST" | "PUT" | "DELETE";
      data?: IncomeInput;
    }) =>
      request<unknown>(`/api/accounting/capital-income${id ? `/${id}` : ""}`, {
        method,
        body: data ? JSON.stringify(data) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROOT_KEY] });
    },
  });
}
