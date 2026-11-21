import { useQuery } from "@tanstack/react-query";

export interface BadgeCounts {
  tickets: number;
  hashrateAlerts: number;
  walletRequests: number;
  frequencyRequests: number;
  walletMismatches: number;
  firmwareRequests: number;
  loginRequests: number;
  simulationRequests: number;
  staffTimeRequests: number;
}

export const BADGE_COUNTS_KEY = "badge-counts";

const EMPTY: BadgeCounts = {
  tickets: 0,
  hashrateAlerts: 0,
  walletRequests: 0,
  frequencyRequests: 0,
  walletMismatches: 0,
  firmwareRequests: 0,
  loginRequests: 0,
  simulationRequests: 0,
  staffTimeRequests: 0,
};

/**
 * All admin badge counts (sidebar + dashboard) from one request, shared by
 * every caller through a single query key.
 */
export function useBadgeCounts(): {
  counts: BadgeCounts;
  loading: boolean;
} {
  const { data, isLoading } = useQuery<BadgeCounts>({
    queryKey: [BADGE_COUNTS_KEY],
    queryFn: async () => {
      const res = await fetch("/api/admin/badge-counts", {
        credentials: "include",
      });
      if (!res.ok) return EMPTY;
      const body = await res.json();
      return { ...EMPTY, ...(body.data ?? {}) };
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
  return { counts: data ?? EMPTY, loading: isLoading };
}
