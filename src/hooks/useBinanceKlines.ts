import { useQuery } from "@tanstack/react-query";

export interface KlineData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface TimeframeConfig {
  interval: string;
  limit: number;
  label: string;
}

const TIMEFRAME_CONFIGS: Record<string, TimeframeConfig> = {
  "24H": { interval: "1h", limit: 24, label: "24 Hours" },
  "7D": { interval: "1d", limit: 7, label: "7 Days" },
  "30D": { interval: "1d", limit: 30, label: "30 Days" },
  "3M": { interval: "1d", limit: 90, label: "3 Months" },
  "1Y": { interval: "1d", limit: 365, label: "1 Year" },
  ALL: { interval: "1w", limit: 1000, label: "All Time" },
};

export const useBinanceKlines = (timeframe: string = "24H") => {
  const config = TIMEFRAME_CONFIGS[timeframe] || TIMEFRAME_CONFIGS["24H"];

  const {
    data: klines,
    isLoading,
    error,
    isError,
  } = useQuery<KlineData[]>({
    queryKey: ["binance-klines", timeframe],
    queryFn: async () => {
      try {
        console.log(`[Binance Klines] Fetching ${timeframe} data...`);

        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${config.interval}&limit=${config.limit}`,
        );

        if (!response.ok) {
          throw new Error(`Binance API error: ${response.statusText}`);
        }

        const data = await response.json();

        console.log(
          `[Binance Klines] Received ${data.length} candles for ${timeframe}`,
        );

        // Transform raw Binance data to KlineData format
        const transformed: KlineData[] = data.map(
          (candle: (string | number)[]) => ({
            openTime: candle[0] as number,
            open: parseFloat(String(candle[1])),
            high: parseFloat(String(candle[2])),
            low: parseFloat(String(candle[3])),
            close: parseFloat(String(candle[4])),
            volume: parseFloat(String(candle[7])),
            closeTime: candle[6] as number,
          }),
        );

        return transformed;
      } catch (err) {
        console.error("[Binance Klines] Error:", err);
        throw err;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes (previously cacheTime)
    refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes for latest data
  });

  return {
    klines: klines || [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    isError,
    timeframeConfig: config,
  };
};
