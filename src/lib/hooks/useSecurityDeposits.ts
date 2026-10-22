import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** USD amounts of one vendor's (or all vendors') security deposit. */
export interface DepositBalance {
  /** Deposits on Pending hardware purchases (not with the vendor yet). */
  pending: number;
  /** Deposits on Paid hardware purchases. */
  paid: number;
  /** Paid back in cash. */
  returned: number;
  /** Applied by the vendor to its invoices. */
  adjusted: number;
  /** paid - returned - adjusted: what the vendor holds now. */
  held: number;
  /** pending + held. */
  outstanding: number;
}

export interface VendorDepositRow extends DepositBalance {
  id: string;
  name: string;
  isActive: boolean;
}

export interface SecurityDepositsSummary {
  vendors: VendorDepositRow[];
  totals: DepositBalance;
}

export interface DepositMovement {
  id: string;
  type: "RETURN" | "ADJUSTMENT";
  date: string;
  amountUsd: string;
  note: string | null;
  amount: string | null;
  exchangeRate: string | null;
  transactionFee: string | null;
  receiptKey: string | null;
  entity: { name: string } | null;
  bank: { name: string } | null;
  currency: { code: string } | null;
  vendorInvoice: {
    id: string;
    invoiceNumber: string;
    paymentStatus: string;
  } | null;
  hardwarePurchase: {
    id: string;
    invoiceNumber: string;
    paymentStatus: string;
  } | null;
  createdAt: string;
  createdByUser: { name: string | null; email: string };
}

export interface AdjustableInvoice {
  kind: "farm" | "hardware";
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  adjusted: number;
  remaining: number;
}

export interface VendorDepositDetail {
  vendor: { id: string; name: string; isActive: boolean };
  balance: DepositBalance;
  depositInvoices: {
    id: string;
    invoiceNumber: string;
    hardwareDescription: string;
    billingDate: string;
    paymentStatus: "Paid" | "Pending" | "Cancelled";
    securityDeposit: string;
  }[];
  movements: DepositMovement[];
  adjustableInvoices: AdjustableInvoice[];
}

const ROOT_KEY = "securityDeposits";

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

/** Per-vendor balances and totals (also feeds the admin panel card). */
export function useSecurityDeposits() {
  return useQuery({
    queryKey: [ROOT_KEY, "summary"],
    queryFn: () =>
      request<SecurityDepositsSummary>("/api/accounting/security-deposits"),
  });
}

export function useVendorDeposit(vendorId: string | null) {
  return useQuery({
    queryKey: [ROOT_KEY, "vendor", vendorId],
    queryFn: () =>
      request<VendorDepositDetail>(
        `/api/accounting/security-deposits/${vendorId}`,
      ),
    enabled: !!vendorId,
  });
}

/**
 * Records or deletes a return / adjustment. An adjustment can mark an
 * invoice Paid, so the invoice lists refresh too.
 */
export function useSaveDepositMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id?: string;
      data?: Record<string, unknown>;
    }) =>
      id
        ? request<unknown>(`/api/accounting/deposit-movements/${id}`, {
            method: "DELETE",
          })
        : request<{ id: string; markedPaid?: boolean }>(
            "/api/accounting/deposit-movements",
            { method: "POST", body: JSON.stringify(data) },
          ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ROOT_KEY] });
      queryClient.invalidateQueries({ queryKey: ["vendorInvoices"] });
      queryClient.invalidateQueries({ queryKey: ["hardwarePurchases"] });
    },
  });
}
