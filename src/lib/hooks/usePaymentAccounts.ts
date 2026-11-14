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
  source:
    | "COST_PAYMENT"
    | "VENDOR_PART"
    | "CONSOLIDATED"
    | "DEPOSIT_RETURN"
    | "TRANSFER"
    | "EXPENSE";
  bankId: string;
  date: string;
  invoices: { number: string; href: string }[];
  invoiceType: string;
  /** Link for the type when there is no invoice (expense rows). */
  typeHref: string | null;
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

export interface ConsolidatedStatement {
  entity: { id: string; name: string } | null;
  /** No bank filter: every bank (of the entity, if one is picked). */
  allBanks: boolean;
  banks: {
    id: string;
    name: string;
    isActive: boolean;
    entity: { id: string; name: string };
  }[];
  range: { from: string | null; to: string | null };
  /** Payments recorded with no bank in the range (on no statement). */
  unbanked: { count: number; amountUsd: string };
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

/** A kind of expense (Finance Settings -> Expense Heads). */
export interface ExpenseHead {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { expenses: number };
  /** USD, 2 dp. Only on the full list (not with activeOnly). */
  amountDueUsd?: string;
  /** Σ payments' USD, fees not included. */
  amountPaidUsd?: string;
}

type Kind = "entities" | "banks" | "currencies" | "vendors" | "expense-heads";

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

/** Expense heads (activeOnly: for the Add expense form). */
export function useExpenseHeads(activeOnly = false) {
  return useQuery({
    queryKey: [ROOT_KEY, "expense-heads", activeOnly],
    queryFn: () => request<ExpenseHead[]>(listUrl("expense-heads", activeOnly)),
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
 * Consolidated statement query string: entity (optional), banks (empty =
 * all), inclusive YYYY-MM-DD days. Also used by the export buttons.
 */
export function consolidatedStatementQuery(
  entityId: string,
  bankIds: string[],
  from: string,
  to: string,
) {
  const params = new URLSearchParams({
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  if (entityId) params.set("entity", entityId);
  if (bankIds.length) params.set("bank", bankIds.join(","));
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return params;
}

/** Several banks' payments in one statement (default: every bank). */
export function useConsolidatedStatement(
  entityId: string,
  bankIds: string[],
  from: string,
  to: string,
) {
  const params = consolidatedStatementQuery(entityId, bankIds, from, to);
  return useQuery({
    queryKey: [
      ROOT_KEY,
      "consolidatedStatement",
      entityId,
      bankIds.join(","),
      from,
      to,
    ],
    queryFn: () =>
      request<ConsolidatedStatement>(
        `/api/accounting/banks/statement?${params.toString()}`,
      ),
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

/** One side of an internal bank transfer. Amounts as 2 dp strings. */
export interface BankTransferSide {
  entityId: string;
  entityName: string;
  bankId: string;
  bankName: string;
  bankActive: boolean;
  currencyId: string;
  currencyCode: string;
  amount: string;
  fee: string;
  /** 1 USD = X currency. */
  exchangeRate: string;
  feeUsd: string;
}

/** Money moved between two of our banks. */
export interface BankTransfer {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  from: BankTransferSide;
  to: BankTransferSide;
  /** 1 from currency = X to currency. */
  conversionRate: string;
  amountUsd: string;
  interCompany: boolean;
  reference: string | null;
  note: string | null;
  receiptKey: string | null;
  receiptHref: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** What the Record / Edit transfer form sends. */
export interface BankTransferInput {
  date: string;
  from: {
    entityId: string;
    bankId: string;
    currencyId: string;
    amount: string;
    fee: string;
  };
  to: {
    entityId: string;
    bankId: string;
    currencyId: string;
    amount: string;
    fee: string;
  };
  conversionRate: string;
  fromUsdRate: string;
  reference: string;
  note: string;
  receiptKey: string | null;
}

export function useBankTransfers() {
  return useQuery({
    queryKey: [ROOT_KEY, "bankTransfers"],
    queryFn: () => request<BankTransfer[]>("/api/accounting/bank-transfers"),
  });
}

/**
 * Record (no id), edit or delete a transfer. Refreshes everything under
 * "paymentAccounts": the list, bank balances and every statement.
 */
export function useSaveBankTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      method,
      data,
    }: {
      id?: string;
      method: "POST" | "PUT" | "DELETE";
      data?: BankTransferInput;
    }) =>
      request<unknown>(`/api/accounting/bank-transfers${id ? `/${id}` : ""}`, {
        method,
        body: data ? JSON.stringify(data) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROOT_KEY] });
    },
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
