import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface FirmwareChangeRequestItem {
  id: string;
  userId: string;
  minerId: string;
  minerName: string;
  subaccountName: string | null;
  currentFirmware: string | null;
  requestedFirmwareId: string;
  requestedFirmwareName: string;
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
  requestedByEmail?: string | null;
  requestedBySecondary?: boolean;
  confirmedById?: string | null;
  confirmedAt?: string | null;
  confirmationMethod?: "CALL" | "EMAIL" | null;
  confirmationContact?: string | null;
  confirmationNote?: string | null;
  confirmedBy?: { id: string; name: string | null; email: string } | null;
}

const QUERY_KEY = "firmware-change-requests";

export function useFirmwareChangeRequests(
  filters?: { status?: string },
  options?: { enabled?: boolean },
) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [QUERY_KEY, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);

      const res = await fetch(`/api/firmware-change-requests?${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch firmware change requests");
      }
      return res.json();
    },
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  return {
    requests: (data?.data as FirmwareChangeRequestItem[]) || [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}

export function useCreateFirmwareChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      minerId: string;
      requestedFirmwareId: string;
      reason?: string;
      currentPassword?: string;
      twoFactorToken?: string;
    }) => {
      const res = await fetch("/api/firmware-change-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error || "Failed to submit firmware change request",
        );
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

interface StepUpCredentials {
  currentPassword?: string;
  twoFactorToken?: string;
}

async function postReviewAction(
  id: string,
  action: "confirm" | "approve" | "reject",
  body: object,
  fallbackError: string,
) {
  const res = await fetch(`/api/firmware-change-requests/${id}/${action}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const resBody = await res.json().catch(() => ({}));
    throw new Error(resBody.error || fallbackError);
  }
  return res.json();
}

export function useReviewFirmwareChangeRequest() {
  const queryClient = useQueryClient();
  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
  };

  const confirmMutation = useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      confirmationMethod: "CALL" | "EMAIL";
      confirmationContact: string;
      confirmationNote: string;
    } & StepUpCredentials) =>
      postReviewAction(id, "confirm", body, "Failed to confirm request"),
    onSuccess,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & StepUpCredentials) =>
      postReviewAction(id, "approve", body, "Failed to approve request"),
    onSuccess,
  });

  const rejectMutation = useMutation({
    mutationFn: async ({
      id,
      ...body
    }: { id: string; rejectionReason: string } & StepUpCredentials) =>
      postReviewAction(id, "reject", body, "Failed to reject request"),
    onSuccess,
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
