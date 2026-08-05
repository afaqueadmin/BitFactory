import { useQuery } from "@tanstack/react-query";
import { AuditLogWithUser } from "@/lib/hooks/useInvoices";

export interface AdjustmentTransaction {
  id: string;
  createdAt: string;
  type: "ADJUSTMENT";
  amount: number;
  consumption: number;
  narration: string | null;
  customer: { id: string; name: string | null; email: string | null } | null;
  invoiceNumber: string | null;
}

export interface AdjustmentsSummary {
  totalAmount: number;
}

interface AdjustmentsResponse {
  success: boolean;
  data: {
    summary: AdjustmentsSummary;
    transactions: AdjustmentTransaction[];
  };
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface AdjustmentsFilters {
  customerId?: string;
  startDate?: string;
  endDate?: string;
}

export interface AdjustmentsSort {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export const useAdjustments = (
  page: number = 0,
  pageSize: number = 25,
  filters: AdjustmentsFilters = {},
  sort: AdjustmentsSort = {},
) => {
  const { customerId, startDate, endDate } = filters;
  const { sortBy, sortOrder } = sort;

  const { data, isLoading, error, refetch } = useQuery<AdjustmentsResponse>({
    queryKey: [
      "adminAdjustments",
      page,
      pageSize,
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
      if (customerId) params.set("customerId", customerId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (sortBy) params.set("sortBy", sortBy);
      if (sortOrder) params.set("sortOrder", sortOrder);

      const response = await fetch(
        `/api/admin/adjustments?${params.toString()}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch adjustments");
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch adjustments");
      }

      return result;
    },
    staleTime: 60 * 1000,
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

export function useAdjustmentAuditLog(adjustmentId: string | null) {
  const { data, isLoading, error } = useQuery<AuditLogWithUser[]>({
    queryKey: ["adjustmentAuditLog", adjustmentId],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/adjustments/${adjustmentId}/audit-log`,
      );

      if (!res.ok) {
        throw new Error("Failed to fetch audit log");
      }

      return await res.json();
    },
    enabled: !!adjustmentId,
    staleTime: 60 * 1000,
  });

  return {
    auditLogs: data || [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
