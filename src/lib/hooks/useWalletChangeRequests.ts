import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface WalletChangeRequestItem {
  id: string;
  userId: string;
  currency: string;
  currentAddress: string | null;
  requestedAddress: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null; email: string };
  reviewedBy: { id: string; name: string | null; email: string } | null;
}

export function useWalletChangeRequests(filters?: { status?: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["wallet-change-requests", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);

      const res = await fetch(`/api/wallet/change-requests?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch wallet change requests");
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  return {
    requests: (data?.data as WalletChangeRequestItem[]) || [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}

export function useCreateWalletChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      requestedAddress: string;
      reason?: string;
      currentPassword?: string;
      twoFactorToken?: string;
    }) => {
      const res = await fetch("/api/wallet/change-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to submit wallet change request");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet-change-requests"] });
    },
  });
}

export function useReviewWalletChangeRequest() {
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/wallet/change-requests/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to approve request");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet-change-requests"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (input: { id: string; rejectionReason: string }) => {
      const res = await fetch(
        `/api/wallet/change-requests/${input.id}/reject`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rejectionReason: input.rejectionReason }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to reject request");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet-change-requests"] });
    },
  });

  return {
    approve: approveMutation.mutateAsync,
    approving: approveMutation.isPending,
    reject: rejectMutation.mutateAsync,
    rejecting: rejectMutation.isPending,
  };
}
