import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface HashrateAlertItem {
  id: string;
  minerId: string;
  date: string;
  actualHashrate: number;
  benchmarkHashrate: number;
  notifiedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; name: string | null; email: string } | null;
  miner: {
    id: string;
    name: string;
    user: { name: string | null; companyName: string | null };
  };
}

export function useHashrateAlerts(filters?: { acknowledged?: boolean }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["hashrate-alerts", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.acknowledged !== undefined) {
        params.append("acknowledged", String(filters.acknowledged));
      }

      const res = await fetch(`/api/admin/hashrate-alerts?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch hashrate alerts");
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  return {
    alerts: (data?.data as HashrateAlertItem[]) || [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}

export function useAcknowledgeHashrateAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/hashrate-alerts/${id}/acknowledge`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to acknowledge alert");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hashrate-alerts"] });
    },
  });
}
