import { useQuery } from "@tanstack/react-query";

export interface HashpricePoint {
  date: string;
  timestamp: number;
  hashprice: number;
  revenue: number;
  hashrate: number;
}

export interface HashpriceHistoryResponse {
  success: boolean;
  data: HashpricePoint[];
  statistics: {
    current: number;
    high: number;
    low: number;
    daysReturned: number;
    currency: string;
    unit: string;
  };
  timestamp: string;
}

/**
 * Custom hook to fetch historical hashprice data
 * Calculates hashprice = daily_revenue / daily_hashrate
 * Uses real Luxor API data (not mock)
 *
 * @param days - Number of days to fetch (1-365, default 30)
 * @returns HashpricePoint array with statistics
 */
export const useHashpriceHistory = (days: number = 30) => {
  const {
    data: response,
    isLoading,
    error,
    isError,
  } = useQuery<HashpriceHistoryResponse>({
    queryKey: ["hashprice-history", days],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("days", String(days));

      const fetchResponse = await fetch(`/api/hashprice-history?${params}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!fetchResponse.ok) {
        throw new Error(
          `Failed to fetch hashprice history: ${fetchResponse.statusText}`,
        );
      }

      const data: HashpriceHistoryResponse = await fetchResponse.json();

      if (!data.success) {
        throw new Error(
          data.data?.toString() || "Failed to fetch hashprice history",
        );
      }

      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refetch every 5 minutes
  });

  return {
    hashpriceData: response?.data || [],
    statistics: response?.statistics || {
      current: 0,
      high: 0,
      low: 0,
      daysReturned: 0,
      currency: "BTC",
      unit: "BTC/PH/s/Day",
    },
    isLoading,
    isError,
    error: error instanceof Error ? error.message : String(error),
    rawResponse: response,
  };
};
