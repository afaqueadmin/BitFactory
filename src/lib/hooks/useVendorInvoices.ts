import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface VendorInvoice {
  id: string;
  invoiceNumber: string;
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

interface VendorInvoicesResponse {
  success: boolean;
  data: VendorInvoice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const useVendorInvoices = (
  page: number = 1,
  limit: number = 10,
  paymentStatus?: string,
  sortBy?: string,
  sortOrder?: "asc" | "desc",
) => {
  const { data, isLoading, error, refetch } = useQuery<VendorInvoicesResponse>({
    queryKey: ["vendorInvoices", page, limit, paymentStatus, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (paymentStatus) {
        params.append("paymentStatus", paymentStatus);
      }
      if (sortBy) {
        params.append("sortBy", sortBy);
        params.append("sortOrder", sortOrder || "asc");
      }

      const response = await fetch(`/api/vendor-invoices?${params}`);

      if (!response.ok) {
        throw new Error("Failed to fetch vendor invoices");
      }

      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
  console.log("Vendor Invoices Data:", data);

  return {
    vendorInvoices: data?.data || [],
    total: data?.total || 0,
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
