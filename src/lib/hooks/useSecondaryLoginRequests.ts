import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface SecondaryLoginRequestItem {
  id: string;
  userId: string;
  requestedEmail: string;
  reason: string | null;
  requestedByEmail: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdLoginId: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null; email: string };
  reviewedBy: { id: string; name: string | null; email: string } | null;
}

/** An API error that keeps the response's code (e.g. HELD_BY_DELETED_ACCOUNT). */
export class SecondaryLoginRequestError extends Error {
  code?: string;
  deletedAccountName?: string;
  constructor(body: {
    error?: string;
    code?: string;
    deletedAccountName?: string;
  }) {
    super(body.error || "Request failed");
    this.code = body.code;
    this.deletedAccountName = body.deletedAccountName;
  }
}

const QUERY_KEY = "secondary-login-requests";

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new SecondaryLoginRequestError(data);
  return data;
}

export function useSecondaryLoginRequests(
  filters?: { status?: string },
  options?: { enabled?: boolean },
) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [QUERY_KEY, filters],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);

      const res = await fetch(`/api/secondary-login-requests?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch sign-in email requests");
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  return {
    requests: (data?.data as SecondaryLoginRequestItem[]) || [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}

export function useCreateSecondaryLoginRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      requestedEmail: string;
      reason?: string;
      currentPassword?: string;
      twoFactorToken?: string;
    }) => post("/api/secondary-login-requests", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

export function useReviewSecondaryLoginRequest() {
  const queryClient = useQueryClient();
  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
  };

  const approveMutation = useMutation({
    mutationFn: ({
      id,
      releaseFromDeleted,
    }: {
      id: string;
      releaseFromDeleted?: boolean;
    }) =>
      post(`/api/secondary-login-requests/${id}/approve`, {
        releaseFromDeleted,
      }),
    onSuccess,
  });

  const rejectMutation = useMutation({
    mutationFn: ({
      id,
      rejectionReason,
    }: {
      id: string;
      rejectionReason: string;
    }) =>
      post(`/api/secondary-login-requests/${id}/reject`, { rejectionReason }),
    onSuccess,
  });

  return {
    approve: approveMutation.mutateAsync,
    approving: approveMutation.isPending,
    reject: rejectMutation.mutateAsync,
    rejecting: rejectMutation.isPending,
  };
}
