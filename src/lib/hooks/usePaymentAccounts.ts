import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface AccountingEntity {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { banks: number };
}

export interface AccountingCurrency {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingBank {
  id: string;
  entityId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  entity: { id: string; name: string; isActive: boolean };
  currencies: {
    currencyId: string;
    currency: Pick<AccountingCurrency, "id" | "code" | "name" | "isActive">;
  }[];
  /** USD, 2 dp. Only on the full list (not with activeOnly). */
  debitUsd?: string;
  creditUsd?: string;
  /** Total Debit − Total Credit. */
  balanceUsd?: string;
}

export interface BankStatementRow {
  id: string;
  source: "COST_PAYMENT" | "VENDOR_PART" | "CONSOLIDATED" | "DEPOSIT_RETURN";
  date: string;
  invoices: { number: string; href: string }[];
  invoiceType: string;
  counterparty: { name: string; href: string | null };
  invoiceAmountUsd: string | null;
  side: "DEBIT" | "CREDIT";
  amountUsd: string;
  original: string | null;
  balanceUsd: string;
  partial: boolean;
  note: string;
  receiptHref: string | null;
}

export interface BankStatement {
  bank: {
    id: string;
    name: string;
    isActive: boolean;
    entity: { id: string; name: string };
    currencies: string[];
  };
  range: { from: string | null; to: string | null };
  openingBalanceUsd: string;
  totals: { debitUsd: string; creditUsd: string };
  closingBalanceUsd: string;
  rows: BankStatementRow[];
}

/** A Hardware Purchase / Farm Tariff vendor (Finance Settings -> Vendors). */
export interface AccountingVendor {
  id: string;
  name: string;
  isActive: boolean;
  forHardwarePurchases: boolean;
  forFarmTariffs: boolean;
  createdAt: string;
  updatedAt: string;
  _count: {
    hardwarePurchases: number;
    vendorInvoices: number;
    depositMovements: number;
  };
}

type Kind = "entities" | "banks" | "currencies" | "vendors";

const ROOT_KEY = "paymentAccounts";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body.data as T;
}

function listUrl(kind: Kind, activeOnly: boolean) {
  return `/api/accounting/${kind}${activeOnly ? "?active=true" : ""}`;
}

export function useAccountingEntities(activeOnly = false) {
  return useQuery({
    queryKey: [ROOT_KEY, "entities", activeOnly],
    queryFn: () => request<AccountingEntity[]>(listUrl("entities", activeOnly)),
  });
}

export function useAccountingBanks(activeOnly = false) {
  return useQuery({
    queryKey: [ROOT_KEY, "banks", activeOnly],
    queryFn: () => request<AccountingBank[]>(listUrl("banks", activeOnly)),
  });
}

export function useAccountingCurrencies(activeOnly = false) {
  return useQuery({
    queryKey: [ROOT_KEY, "currencies", activeOnly],
    queryFn: () =>
      request<AccountingCurrency[]>(listUrl("currencies", activeOnly)),
  });
}

/**
 * One bank's statement. `from` / `to` are inclusive YYYY-MM-DD days (empty =
 * no bound), taken in the browser's time zone.
 */
export function useBankStatement(bankId: string, from: string, to: string) {
  const params = new URLSearchParams({
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return useQuery({
    queryKey: [ROOT_KEY, "bankStatement", bankId, from, to],
    queryFn: () =>
      request<BankStatement>(
        `/api/accounting/banks/${bankId}/statement?${params.toString()}`,
      ),
    enabled: !!bankId,
  });
}

/**
 * Vendors, optionally only active ones tagged for one invoice type
 * ("hardware" = Hardware Purchases, "farm" = Farm Tariffs).
 */
export function useAccountingVendors(
  activeOnly = false,
  forType?: "hardware" | "farm",
) {
  const params = new URLSearchParams();
  if (activeOnly) params.set("active", "true");
  if (forType) params.set("for", forType);
  const query = params.toString();
  return useQuery({
    queryKey: [ROOT_KEY, "vendors", activeOnly, forType ?? null],
    queryFn: () =>
      request<AccountingVendor[]>(
        `/api/accounting/vendors${query ? `?${query}` : ""}`,
      ),
  });
}

/**
 * Create, update or delete one master-data record. Any change refreshes all
 * the lists, since bank counts and currency chips depend on each other.
 */
export function useSavePaymentAccount(kind: Kind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      method,
      data,
    }: {
      id?: string;
      method: "POST" | "PUT" | "DELETE";
      data?: Record<string, unknown>;
    }) =>
      request<unknown>(`/api/accounting/${kind}${id ? `/${id}` : ""}`, {
        method,
        body: data ? JSON.stringify(data) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROOT_KEY] });
    },
  });
}
