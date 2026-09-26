import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface WalletChangeRequestItem {
  id: string;
  userId: string;
  currency: string;
  subaccountName: string | null;
  currentAddress: string | null;
  requestedAddress: string;
  reason: string | null;
  status: "PENDING" | "CONFIRMED" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null; email: string };
  reviewedBy: { id: string; name: string | null; email: string } | null;
  // Admin-only - stripped from the response for CLIENT/FRANCHISEE callers.
  confirmedById?: string | null;
  confirmedAt?: string | null;
  confirmationMethod?: "CALL" | "EMAIL" | null;
  confirmationContact?: string | null;
  confirmationNote?: string | null;
  confirmedBy?: { id: string; name: string | null; email: string } | null;
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
      subaccountName?: string;
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

interface StepUpCredentials {
  currentPassword?: string;
  twoFactorToken?: string;
}

export function useReviewWalletChangeRequest() {
  const queryClient = useQueryClient();

  const confirmMutation = useMutation({
    mutationFn: async (
      input: {
        id: string;
        confirmationMethod: "CALL" | "EMAIL";
        confirmationContact: string;
        confirmationNote: string;
      } & StepUpCredentials,
    ) => {
      const { id, ...body } = input;
      const res = await fetch(`/api/wallet/change-requests/${id}/confirm`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const body2 = await res.json().catch(() => ({}));
        throw new Error(body2.error || "Failed to confirm request");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet-change-requests"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (input: { id: string } & StepUpCredentials) => {
      const { id, ...body } = input;
      const res = await fetch(`/api/wallet/change-requests/${id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const body2 = await res.json().catch(() => ({}));
        throw new Error(body2.error || "Failed to approve request");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet-change-requests"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (
      input: { id: string; rejectionReason: string } & StepUpCredentials,
    ) => {
      const { id, ...body } = input;
      const res = await fetch(`/api/wallet/change-requests/${id}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const body2 = await res.json().catch(() => ({}));
        throw new Error(body2.error || "Failed to reject request");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet-change-requests"] });
    },
  });

  return {
    confirm: confirmMutation.mutateAsync,
    confirming: confirmMutation.isPending,
    approve: approveMutation.mutateAsync,
    approving: approveMutation.isPending,
    reject: rejectMutation.mutateAsync,
    rejecting: rejectMutation.isPending,
  };
}
