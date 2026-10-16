import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface FirmwareOptionItem {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  /** Only present on the admin listing (includeInactive). */
  _count?: { requests: number };
}

const QUERY_KEY = "firmware-options";

/** Active options only, unless includeInactive (admin-only server-side). */
export function useFirmwareOptions(
  filters?: { includeInactive?: boolean },
  options?: { enabled?: boolean },
) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [QUERY_KEY, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.includeInactive) params.append("includeInactive", "1");

      const res = await fetch(`/api/firmware-options?${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch firmware options");
      }
      return res.json();
    },
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
  });

  return {
    options: (data?.data as FirmwareOptionItem[]) || [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}

async function send(url: string, method: string, body?: object) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const resBody = await res.json().catch(() => ({}));
    throw new Error(resBody.error || "Failed to save firmware option");
  }
  return res.json();
}

export function useManageFirmwareOptions() {
  const queryClient = useQueryClient();
  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
  };

  const createMutation = useMutation({
    mutationFn: (input: { name: string }) =>
      send("/api/firmware-options", "POST", input),
    onSuccess,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      isActive?: boolean;
    }) => send(`/api/firmware-options/${id}`, "PUT", body),
    onSuccess,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => send(`/api/firmware-options/${id}`, "DELETE"),
    onSuccess,
  });

  return {
    create: createMutation.mutateAsync,
    creating: createMutation.isPending,
    update: updateMutation.mutateAsync,
    updating: updateMutation.isPending,
    remove: deleteMutation.mutateAsync,
    removing: deleteMutation.isPending,
  };
}
