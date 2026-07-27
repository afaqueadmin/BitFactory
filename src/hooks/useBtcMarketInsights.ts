import { useQuery } from "@tanstack/react-query";

export interface FearGreedData {
  value: number;
  classification: string;
  timestamp: number;
}

export interface CoinGeckoData {
  marketCapRank: number | null;
  ath: number;
  athChangePercentage: number;
  atl: number;
  atlChangePercentage: number;
  priceChangePercentage1h: number | null;
  priceChangePercentage24h: number | null;
  priceChangePercentage7d: number | null;
  priceChangePercentage30d: number | null;
  sentimentVotesUpPercentage: number | null;
  sentimentVotesDownPercentage: number | null;
}

export interface BtcMarketInsights {
  fearGreed: FearGreedData | null;
  coingecko: CoinGeckoData | null;
  errors: Record<string, string>;
  timestamp: number;
}

export const useBtcMarketInsights = () => {
  const { data, isLoading, error, isError } = useQuery<BtcMarketInsights>({
    queryKey: ["btc-market-insights"],
    queryFn: async () => {
      const response = await fetch("/api/btc-market-insights");
      if (!response.ok) {
        throw new Error("Failed to fetch BTC market insights");
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchInterval: 1000 * 60 * 2,
  });

  return {
    insights: data,
    isLoading,
    isError,
    error: error instanceof Error ? error.message : null,
  };
};
