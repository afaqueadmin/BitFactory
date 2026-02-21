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
) => {
  const { data, isLoading, error, refetch } = useQuery<VendorInvoicesResponse>({
    queryKey: ["vendorInvoices", page, limit, paymentStatus],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (paymentStatus) {
        params.append("paymentStatus", paymentStatus);
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

export const useCreateVendorInvoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      invoiceNumber: string;
      billingDate: string;
      dueDate: string;
      totalMiners: number;
      unitPrice: number;
      miscellaneousCharges: number;
      totalAmount: number;
      notes?: string;
      paymentStatus: "Paid" | "Pending" | "Cancelled";
    }) => {
      const response = await fetch("/api/vendor-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create vendor invoice");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendorInvoices"] });
    },
  });
};
