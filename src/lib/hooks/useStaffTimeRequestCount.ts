import { useQuery } from "@tanstack/react-query";

/**
 * Pending requests for more working time from staff on office hours - the
 * admin sidebar's badge on Access Rules. SUPER_ADMIN only (pass `enabled`).
 */
export function useStaffTimeRequestCount(enabled: boolean): number {
  const { data } = useQuery<number>({
    queryKey: ["staff-time-request-count"],
    enabled,
    queryFn: async () => {
      const res = await fetch("/api/admin/staff-access/requests", {
        credentials: "include",
      });
      if (!res.ok) return 0;
      const body = await res.json();
      return typeof body.count === "number" ? body.count : 0;
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
  return data ?? 0;
}
