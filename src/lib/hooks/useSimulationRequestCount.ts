import { useQuery } from "@tanstack/react-query";

/**
 * Open requests from Potential Customers for a simulated account - the
 * admin sidebar's badge on Simulated Accounts.
 */
export function useSimulationRequestCount(): number {
  const { data } = useQuery<number>({
    queryKey: ["simulation-request-count"],
    queryFn: async () => {
      const res = await fetch("/api/simulated-accounts", {
        credentials: "include",
      });
      if (!res.ok) return 0;
      const body = await res.json();
      return Array.isArray(body.requests) ? body.requests.length : 0;
    },
    staleTime: 60 * 1000,
  });
  return data ?? 0;
}
