import { useQuery } from "@tanstack/react-query";
import { AuditLogWithUser } from "@/lib/hooks/useInvoices";

export interface MemoTransaction {
  id: string;
  memoNumber: string;
  createdAt: string;
  category: "HOSTING" | "HARDWARE";
  memoType: "CUSTOMER_FACING" | "INTERNAL";
  status: "ISSUED" | "VOIDED";
  amount: number;
  reason: string;
  voidReason: string | null;
  pairedMemoId: string | null;
  user: { id: string; name: string | null; email: string | null } | null;
  invoice: { id: string; invoiceNumber: string } | null;
}

export interface MemosSummary {
  totalAmount: number;
}

interface MemosResponse {
  success: boolean;
  data: {
    summary: MemosSummary;
    memos: MemoTransaction[];
  };
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface MemosFilters {
  customerId?: string;
  invoiceId?: string;
  category?: "HOSTING" | "HARDWARE";
  memoType?: "CUSTOMER_FACING" | "INTERNAL";
  status?: "ISSUED" | "VOIDED";
  startDate?: string;
  endDate?: string;
}

export interface MemosSort {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export const useMemos = (
  page: number = 0,
  pageSize: number = 25,
  filters: MemosFilters = {},
  sort: MemosSort = {},
) => {
  const {
    customerId,
    invoiceId,
    category,
    memoType,
    status,
    startDate,
    endDate,
  } = filters;
  const { sortBy, sortOrder } = sort;

  const { data, isLoading, error, refetch } = useQuery<MemosResponse>({
    queryKey: [
      "memos",
      page,
      pageSize,
      customerId,
      invoiceId,
      category,
      memoType,
      status,
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
      if (invoiceId) params.set("invoiceId", invoiceId);
      if (category) params.set("category", category);
      if (memoType) params.set("memoType", memoType);
      if (status) params.set("status", status);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (sortBy) params.set("sortBy", sortBy);
      if (sortOrder) params.set("sortOrder", sortOrder);

      const response = await fetch(`/api/memos?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch memos");
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch memos");
      }

      return result;
    },
    staleTime: 60 * 1000,
    retry: 2,
  });

  return {
    summary: data?.data.summary,
    memos: data?.data.memos || [],
    pagination: data?.pagination,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
};

export function useMemoAuditLog(memoId: string | null) {
  const { data, isLoading, error } = useQuery<AuditLogWithUser[]>({
    queryKey: ["memoAuditLog", memoId],
    queryFn: async () => {
      const res = await fetch(`/api/memos/${memoId}/audit-log`);

      if (!res.ok) {
        throw new Error("Failed to fetch audit log");
      }

      return await res.json();
    },
    enabled: !!memoId,
    staleTime: 60 * 1000,
  });

  return {
    auditLogs: data || [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
