import { useQuery } from "@tanstack/react-query";
import { PaybackHistoryPoint } from "@/lib/helpers/paybackChartMapping";
import { PaybackHistoryRange } from "@/lib/helpers/paybackHistoryRange";
import { MinerModel } from "@/lib/helpers/paybackCalculations";

export type PaybackHistoryProfile = "CLIENT" | "COMPANY";

export interface PaybackHistoryResponse {
  success: boolean;
  range: PaybackHistoryRange;
  miner: MinerModel;
  data: PaybackHistoryPoint[];
  error?: string;
}

/**
 * Fetches the "Buy BTC vs Mine BTC" history series for either the
 * CLIENT (customer) or COMPANY (self-mining) profile. Same react-query
 * shape/conventions as useHashpriceHistory.
 */
export const usePaybackHistory = (
  profile: PaybackHistoryProfile,
  miner: MinerModel,
  range: PaybackHistoryRange,
) => {
  const endpoint =
    profile === "COMPANY"
      ? "/api/payback-history-company"
      : "/api/payback-history";

  const {
    data: response,
    isLoading,
    isError,
    error,
  } = useQuery<PaybackHistoryResponse>({
    queryKey: ["payback-history", profile, miner, range],
    queryFn: async () => {
      const params = new URLSearchParams({ range, miner });
      const fetchResponse = await fetch(`${endpoint}?${params}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!fetchResponse.ok) {
        throw new Error(
          `Failed to fetch payback history: ${fetchResponse.statusText}`,
        );
      }

      const data: PaybackHistoryResponse = await fetchResponse.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch payback history");
      }

      return data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    historyData: response?.data ?? [],
    isLoading,
    isError,
    error: error instanceof Error ? error.message : String(error ?? ""),
  };
};
