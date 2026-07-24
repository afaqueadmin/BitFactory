import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface HardwarePurchaseInvoice {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  hardwareDescription: string;
  billingDate: Date;
  issuedDate: Date | null;
  paidDate: Date | null;
  dueDate: Date;
  quantity: number;
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

interface HardwarePurchasesResponse {
  success: boolean;
  data: HardwarePurchaseInvoice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const useHardwarePurchases = (
  page: number = 1,
  limit: number = 10,
  paymentStatus?: string,
  sortBy?: string,
  sortOrder?: "asc" | "desc",
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
      ],
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

        const response = await fetch(`/api/hardware-purchases?${params}`);

        if (!response.ok) {
          throw new Error("Failed to fetch hardware purchase invoices");
        }

        return response.json();
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
    });

  return {
    hardwarePurchases: data?.data || [],
    total: data?.total || 0,
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
      vendorName: string;
      hardwareDescription: string;
      billingDate: string;
      issuedDate?: string;
      dueDate: string;
      quantity: number;
      unitPrice: number;
      miscellaneousCharges: number;
      totalAmount: number;
      notes?: string;
      paymentStatus: "Paid" | "Pending" | "Cancelled";
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
