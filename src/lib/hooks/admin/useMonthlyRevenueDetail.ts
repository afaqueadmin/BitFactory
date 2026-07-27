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

export const useMonthlyRevenueDetail = (
  page: number = 0,
  pageSize: number = 25,
) => {
  const { data, isLoading, error, refetch } =
    useQuery<MonthlyRevenueDetailResponse>({
      queryKey: ["adminMonthlyRevenueDetail", page, pageSize],
      queryFn: async () => {
        const response = await fetch(
          `/api/admin/monthly-revenue?page=${page}&pageSize=${pageSize}`,
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
