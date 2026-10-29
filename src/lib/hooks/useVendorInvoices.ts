import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

/**
 * One currency part of a Farm Tariff / Hardware Purchase payment, as the
 * detail endpoints return it. Amounts arrive as decimal strings; amount and
 * transactionFee are in the part's currency, exchangeRate is 1 USD = X.
 */
export interface VendorPaymentPart {
  id: string;
  amount: string;
  exchangeRate: string;
  amountUsd: string;
  transactionFee: string;
  sortOrder: number;
  entity: { id: string; name: string };
  bank: { id: string; name: string };
  currency: { id: string; code: string; name: string };
}

/** A Farm Tariff / Hardware Purchase invoice's vendor. */
export interface InvoiceVendor {
  id: string;
  name: string;
  isActive: boolean;
}

/**
 * Security deposit the vendor applied to an invoice (detail responses
 * only). It lowers the invoice's cash due. amountUsd is a decimal string.
 */
export interface DepositAdjustment {
  id: string;
  date: string;
  amountUsd: string;
  note: string | null;
}

export interface VendorInvoice {
  id: string;
  invoiceNumber: string;
  /** Optional on Farm Tariffs: older ones have none. */
  vendorId: string | null;
  vendor?: InvoiceVendor | null;
  depositAdjustments?: DepositAdjustment[];
  billingDate: Date;
  paidDate: Date | null;
  dueDate: Date;
  totalMiners: number;
  unitPrice: number;
  miscellaneousCharges: number;
  totalAmount: number;
  paymentStatus: "Paid" | "Pending" | "Cancelled";
  notes: string | null;
  invoicePdfKey: string | null;
  invoicePdfName: string | null;
  invoiceSheetKey: string | null;
  invoiceSheetName: string | null;
  // DEPRECATED (2026-10-20): single-currency payment columns, no longer
  // written or read (the payment lives in paymentParts). TODO: remove
  // with the columns after 2026-11-19.
  paymentEntityId: string | null;
  paymentBankId: string | null;
  paymentCurrencyId: string | null;
  paymentAmount: string | null;
  paymentExchangeRate: string | null;
  paymentAmountUsd: string | null;
  transactionFee: string | null;
  paymentReceiptKey: string | null;
  /** The payment's currency parts (detail responses only). */
  paymentParts?: VendorPaymentPart[];
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

interface VendorInvoicesResponse {
  success: boolean;
  data: VendorInvoice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: VendorInvoiceSummary;
}

/** Stat-card totals over every invoice matching the filters (Pending only). */
export interface VendorInvoiceSummary {
  unpaidCount: number;
  overdueCount: number;
  totalOutstanding: number;
}

/** "none" in vendorId matches Farm Tariffs with no vendor set. */
export const NO_VENDOR_FILTER = "none";

export interface VendorInvoiceFilters {
  /** A vendor id, or NO_VENDOR_FILTER. */
  vendorId?: string;
  /** Issued Date (billingDate) range, as YYYY-MM-DD from a date input. */
  startDate?: string;
  endDate?: string;
}

export const useVendorInvoices = (
  page: number = 1,
  limit: number = 10,
  paymentStatus?: string,
  sortBy?: string,
  sortOrder?: "asc" | "desc",
  filters?: VendorInvoiceFilters,
) => {
  const { data, isLoading, error, refetch } = useQuery<VendorInvoicesResponse>({
    queryKey: [
      "vendorInvoices",
      page,
      limit,
      paymentStatus,
      sortBy,
      sortOrder,
      filters?.vendorId,
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
      if (filters?.vendorId) params.append("vendorId", filters.vendorId);
      if (filters?.startDate) params.append("startDate", filters.startDate);
      if (filters?.endDate) params.append("endDate", filters.endDate);

      const response = await fetch(`/api/vendor-invoices?${params}`);

      if (!response.ok) {
        throw new Error("Failed to fetch vendor invoices");
      }

      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    // Keep the current rows on screen while a filter change refetches,
    // instead of dropping back to the page's loading spinner.
    placeholderData: keepPreviousData,
  });
  console.log("Vendor Invoices Data:", data);

  return {
    vendorInvoices: data?.data || [],
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

export const useDeleteVendorInvoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await fetch(`/api/vendor-invoices/${invoiceId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete vendor invoice");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendorInvoices"] });
    },
  });
};
