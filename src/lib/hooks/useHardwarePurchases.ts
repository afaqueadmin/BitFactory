import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

export type VendorNameValue = "HASHLABS_PTE_LTD" | "QRB_LABS" | "LUXOR_TECH";

export const VENDOR_NAME_OPTIONS: Array<{
  value: VendorNameValue;
  label: string;
}> = [
  { value: "HASHLABS_PTE_LTD", label: "HashLabs Pte Ltd" },
  { value: "QRB_LABS", label: "QRB Labs" },
  { value: "LUXOR_TECH", label: "Luxor Tech" },
];

export const VENDOR_NAME_LABELS: Record<string, string> = Object.fromEntries(
  VENDOR_NAME_OPTIONS.map((o) => [o.value, o.label]),
);

export interface HardwarePurchaseInvoice {
  id: string;
  invoiceNumber: string;
  vendorName: VendorNameValue;
  hardwareDescription: string;
  billingDate: Date;
  paidDate: Date | null;
  dueDate: Date;
  quantity: number;
  unitPrice: number;
  miscellaneousCharges: number;
  totalAmount: number;
  paymentStatus: "Paid" | "Pending" | "Cancelled";
  notes: string | null;
  invoicePdfKey: string | null;
  // Set when the payment is recorded; amounts arrive as decimal strings.
  paymentEntityId: string | null;
  paymentBankId: string | null;
  paymentCurrencyId: string | null;
  paymentAmount: string | null;
  paymentExchangeRate: string | null;
  paymentAmountUsd: string | null;
  transactionFee: string | null;
  paymentReceiptKey: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUser?: {
    id: string;
    email: string;
    name: string | null;
  };
  updatedByUser?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

interface HardwarePurchasesResponse {
  success: boolean;
  data: HardwarePurchaseInvoice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary?: HardwarePurchaseSummary;
}

/** Stat-card totals over every invoice matching the filters (Pending only). */
export interface HardwarePurchaseSummary {
  unpaidCount: number;
  overdueCount: number;
  totalOutstanding: number;
}

export interface HardwarePurchaseFilters {
  vendorName?: VendorNameValue;
  /** Matches any part of the hardware description, ignoring case. */
  hardware?: string;
  /** Issued Date (billingDate) range, as YYYY-MM-DD from a date input. */
  startDate?: string;
  endDate?: string;
}

export const useHardwarePurchases = (
  page: number = 1,
  limit: number = 10,
  paymentStatus?: string,
  sortBy?: string,
  sortOrder?: "asc" | "desc",
  filters?: HardwarePurchaseFilters,
) => {
  const { data, isLoading, error, refetch } =
    useQuery<HardwarePurchasesResponse>({
      queryKey: [
        "hardwarePurchases",
        page,
        limit,
        paymentStatus,
        sortBy,
        sortOrder,
        filters?.vendorName,
        filters?.hardware,
        filters?.startDate,
        filters?.endDate,
      ],
      queryFn: async () => {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        if (paymentStatus) {
          params.append("paymentStatus", paymentStatus);
        }
        if (sortBy) {
          params.append("sortBy", sortBy);
          params.append("sortOrder", sortOrder || "asc");
        }
        if (filters?.vendorName)
          params.append("vendorName", filters.vendorName);
        if (filters?.hardware) params.append("hardware", filters.hardware);
        if (filters?.startDate) params.append("startDate", filters.startDate);
        if (filters?.endDate) params.append("endDate", filters.endDate);

        const response = await fetch(`/api/hardware-purchases?${params}`);

        if (!response.ok) {
          throw new Error("Failed to fetch hardware purchase invoices");
        }

        return response.json();
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
      // Keep the current rows on screen while a filter change refetches,
      // instead of dropping back to the page's loading spinner (which would
      // also unmount the filter inputs mid-typing).
      placeholderData: keepPreviousData,
    });

  return {
    hardwarePurchases: data?.data || [],
    total: data?.total || 0,
    summary: data?.summary ?? {
      unpaidCount: 0,
      overdueCount: 0,
      totalOutstanding: 0,
    },
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
};

export const useCreateHardwarePurchase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      invoiceNumber: string;
      vendorName: VendorNameValue;
      hardwareDescription: string;
      billingDate: string;
      dueDate: string;
      quantity: number;
      unitPrice: number;
      miscellaneousCharges: number;
      totalAmount: number;
      notes?: string;
      invoicePdfKey: string;
    }) => {
      const response = await fetch("/api/hardware-purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || "Failed to create hardware purchase invoice",
        );
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hardwarePurchases"] });
    },
  });
};

export const useDeleteHardwarePurchase = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await fetch(`/api/hardware-purchases/${invoiceId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || "Failed to delete hardware purchase invoice",
        );
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hardwarePurchases"] });
    },
  });
};
