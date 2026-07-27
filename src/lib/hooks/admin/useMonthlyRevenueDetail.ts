import { useQuery } from "@tanstack/react-query";

export interface MonthlyRevenueTransaction {
  id: string;
  createdAt: string;
  type: "ELECTRICITY_CHARGES" | "ADJUSTMENT";
  amount: number;
  consumption: number;
  narration: string | null;
  customer: { id: string; name: string | null; email: string | null } | null;
  invoiceNumber: string | null;
}

export interface MonthlyRevenueSummary {
  periodStart: string;
  periodEnd: string;
  sumElectricityCharges: number;
  sumAdjustment: number;
  rawTotal: number;
  displayTotal: number;
}

interface MonthlyRevenueDetailResponse {
  success: boolean;
  data: {
    summary: MonthlyRevenueSummary;
    transactions: MonthlyRevenueTransaction[];
  };
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface MonthlyRevenueDetailFilters {
  type?: "ELECTRICITY_CHARGES" | "ADJUSTMENT";
  customer?: string;
  startDate?: string;
  endDate?: string;
}

export interface MonthlyRevenueDetailSort {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export const useMonthlyRevenueDetail = (
  page: number = 0,
  pageSize: number = 25,
  filters: MonthlyRevenueDetailFilters = {},
  sort: MonthlyRevenueDetailSort = {},
) => {
  const { type, customer, startDate, endDate } = filters;
  const { sortBy, sortOrder } = sort;

  const { data, isLoading, error, refetch } =
    useQuery<MonthlyRevenueDetailResponse>({
      queryKey: [
        "adminMonthlyRevenueDetail",
        page,
        pageSize,
        type,
        customer,
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
        if (customer) params.set("customer", customer);
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        if (sortBy) params.set("sortBy", sortBy);
        if (sortOrder) params.set("sortOrder", sortOrder);

        const response = await fetch(
          `/api/admin/monthly-revenue?${params.toString()}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch monthly revenue detail");
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(
            result.error || "Failed to fetch monthly revenue detail",
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
