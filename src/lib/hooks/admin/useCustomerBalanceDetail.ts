import { useQuery } from "@tanstack/react-query";

export interface CustomerBalanceTransaction {
  id: string;
  createdAt: string;
  type: "PAYMENT" | "ELECTRICITY_CHARGES" | "ADJUSTMENT";
  amount: number;
  consumption: number;
  narration: string | null;
  customer: { id: string; name: string | null; email: string | null } | null;
  invoiceNumber: string | null;
}

export interface CustomerBalanceSummary {
  sumPayment: number;
  sumElectricityCharges: number;
  sumAdjustment: number;
  displayTotal: number;
}

interface CustomerBalanceDetailResponse {
  success: boolean;
  data: {
    summary: CustomerBalanceSummary;
    transactions: CustomerBalanceTransaction[];
  };
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface CustomerBalanceDetailFilters {
  type?: "PAYMENT" | "ELECTRICITY_CHARGES" | "ADJUSTMENT";
  customerId?: string;
  startDate?: string;
  endDate?: string;
}

export interface CustomerBalanceDetailSort {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export const useCustomerBalanceDetail = (
  page: number = 0,
  pageSize: number = 25,
  filters: CustomerBalanceDetailFilters = {},
  sort: CustomerBalanceDetailSort = {},
) => {
  const { type, customerId, startDate, endDate } = filters;
  const { sortBy, sortOrder } = sort;

  const { data, isLoading, error, refetch } =
    useQuery<CustomerBalanceDetailResponse>({
      queryKey: [
        "adminCustomerBalanceDetail",
        page,
        pageSize,
        type,
        customerId,
        startDate,
        endDate,
        sortBy,
        sortOrder,
      ],
      queryFn: async () => {
        const params = new URLSearchParams({
          page: page.toString(),
          pageSize: pageSize.toString(),
        });
        if (type) params.set("type", type);
        if (customerId) params.set("customerId", customerId);
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        if (sortBy) params.set("sortBy", sortBy);
        if (sortOrder) params.set("sortOrder", sortOrder);

        const response = await fetch(
          `/api/admin/customer-balance?${params.toString()}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch customer balance detail");
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(
            result.error || "Failed to fetch customer balance detail",
          );
        }

        return result;
      },
      staleTime: 5 * 60 * 1000,
      retry: 2,
    });

  return {
    summary: data?.data.summary,
    transactions: data?.data.transactions || [],
    pagination: data?.pagination,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
};
