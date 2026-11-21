"use client";

import { useQuery } from "@tanstack/react-query";

/** Open Luxor wallet mismatches - for the admin sidebar's Wallets badge. */
export function useWalletMismatchCount(): number {
  const { data } = useQuery<number>({
    queryKey: ["wallet-mismatch-count"],
    queryFn: async () => {
      const res = await fetch("/api/wallets/mismatches", {
        credentials: "include",
      });
      if (!res.ok) return 0;
      const body = await res.json();
      return Array.isArray(body.data) ? body.data.length : 0;
    },
    staleTime: 60 * 1000,
  });
  return data ?? 0;
}
