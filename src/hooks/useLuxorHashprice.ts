import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/contexts/auth-context";

export interface HashpriceData {
  timestamp: number;
  date: string;
  hashprice: number;
}

export interface LuxorSummaryResponse {
  success: boolean;
  data: {
    currency_type: string;
    hashprice: Array<{
      currency_type: string;
      value: number;
    }>;
    hashrate_5m: string;
    hashrate_24h: string;
  };
}

/**
 * Custom hook to fetch hashprice data from Luxor API
 *
 * Uses the /api/miners/summary endpoint which returns pool hashprice
 * Data is cached with TanStack Query for 5 minutes (stale) and 10 minutes (GC)
 *
 * @returns {Object} Object with hashprice data and loading/error states
 *   - hashpriceData: Array of hashprice points with timestamp and price
 *   - currentHashprice: Current hashprice value (latest data point)
 *   - isLoading: Whether data is being fetched
 *   - isError: Whether an error occurred
 *   - error: Error message if isError is true
 */
export const useLuxorHashprice = () => {
  const { user } = useAuth();

  console.log("[Luxor Hashprice Hook] Initialized - User:", user);

  const {
    data: rawData,
    isLoading,
    error,
    isError,
  } = useQuery<LuxorSummaryResponse>({
    queryKey: ["luxor-hashprice"],
    queryFn: async () => {
      const response = await fetch("/api/miners/summary", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch hashprice: ${response.statusText}`);
      }

      const data: LuxorSummaryResponse = await response.json();

      if (!data.success) {
        throw new Error(data.data?.toString() || "Failed to fetch hashprice");
      }

      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refetch every 5 minutes
    enabled: true, // Always enabled - we'll handle auth errors in the API
  });

  console.log("[Luxor Hashprice Hook] Query State:", {
    isLoading,
    isError,
    error: error?.message,
    hasData: !!rawData,
  });

  // Extract current hashprice value
  const currentHashprice = rawData?.data?.hashprice?.[0]?.value || 0;

  // For now, return single data point since Luxor summary doesn't provide historical data
  // In future, this could be enhanced to track historical data points
  const hashpriceData: HashpriceData[] = currentHashprice
    ? [
        {
          timestamp: Date.now(),
          date: new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          hashprice: currentHashprice,
        },
      ]
    : [];

  return {
    hashpriceData,
    currentHashprice,
    isLoading,
    isError,
    error: error instanceof Error ? error.message : String(error),
    rawData,
  };
};
