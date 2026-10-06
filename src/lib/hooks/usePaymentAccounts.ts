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
}

type Kind = "entities" | "banks" | "currencies";

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
 * Create, update or delete one master-data record. Any change refreshes all
 * three lists, since bank counts and currency chips depend on each other.
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
