import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Expenses & Heads. Query keys sit under "paymentAccounts" so a saved
 * payment also refreshes bank balances and statements, and the other way
 * round.
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

export type ExpenseStatus = "PENDING" | "PARTIAL" | "PAID";

export interface ExpenseFile {
  key: string;
  fileName: string;
  href: string;
}

export interface ExpensePayment {
  id: string;
  expenseId: string;
  /** YYYY-MM-DD. */
  date: string;
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
  note: string | null;
  receiptKey: string | null;
  receiptHref: string | null;
  createdBy: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  head: { id: string; name: string; isActive: boolean };
  narration: string | null;
  pdf: ExpenseFile | null;
  sheet: ExpenseFile | null;
  amountDueUsd: string;
  paidUsd: string;
  balanceUsd: string;
  feesUsd: string;
  status: ExpenseStatus;
  banks: { id: string; name: string; entityName: string }[];
  payments: ExpensePayment[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** What the Add / Edit expense form sends. */
export interface ExpenseInput {
  date: string;
  headId: string;
  narration: string;
  amountDueUsd: string;
  pdf: { key: string; fileName: string } | null;
  sheet: { key: string; fileName: string } | null;
}

/** What the Record / Edit payment form sends. */
export interface ExpensePaymentInput {
  date: string;
  entityId: string;
  bankId: string;
  currencyId: string;
  exchangeRate: string;
  amount: string;
  fee: string;
  note: string;
  receiptKey: string | null;
}

export interface ExpenseReportCell {
  dueUsd: string;
  paidUsd: string;
  balanceUsd: string;
  feesUsd: string;
}

export interface ExpenseReport {
  range: { from: string | null; to: string | null };
  /** "YYYY-MM", oldest first. */
  months: string[];
  rows: {
    head: string;
    cells: Record<string, ExpenseReportCell>;
    total: ExpenseReportCell;
  }[];
  totals: Record<string, ExpenseReportCell>;
  grandTotal: ExpenseReportCell;
}

export function useExpenses() {
  return useQuery({
    queryKey: [ROOT_KEY, "expenses"],
    queryFn: () => request<Expense[]>("/api/accounting/expenses"),
  });
}

export function useExpenseReport(from: string, to: string, headId: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (headId) params.set("head", headId);
  return useQuery({
    queryKey: [ROOT_KEY, "expenseReport", from, to, headId],
    queryFn: () =>
      request<ExpenseReport>(
        `/api/accounting/expenses/report?${params.toString()}`,
      ),
  });
}

/** Add (no id), edit or delete an expense. */
export function useSaveExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      method,
      data,
    }: {
      id?: string;
      method: "POST" | "PUT" | "DELETE";
      data?: ExpenseInput;
    }) =>
      request<unknown>(`/api/accounting/expenses${id ? `/${id}` : ""}`, {
        method,
        body: data ? JSON.stringify(data) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROOT_KEY] });
    },
  });
}

/**
 * Record a payment of an expense (POST with expenseId), or edit / delete
 * one (PUT / DELETE with id). Refreshes bank balances and statements too.
 */
export function useSaveExpensePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      expenseId,
      id,
      method,
      data,
    }: {
      expenseId?: string;
      id?: string;
      method: "POST" | "PUT" | "DELETE";
      data?: ExpensePaymentInput;
    }) =>
      request<unknown>(
        method === "POST"
          ? `/api/accounting/expenses/${expenseId}/payments`
          : `/api/accounting/expense-payments/${id}`,
        { method, body: data ? JSON.stringify(data) : undefined },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROOT_KEY] });
    },
  });
}
