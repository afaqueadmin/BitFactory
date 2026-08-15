import { useQuery } from "@tanstack/react-query";
import { Period, TickSize } from "@/lib/hashrateWindows";

export interface HashratePoint {
  /** Epoch milliseconds (UTC). */
  t: number;
  /** Hashrate in H/s. */
  hashrate: number;
  /** Share efficiency as a percentage (0-100), or null if unsupported. */
  efficiency: number | null;
}

export interface UptimePoint {
  /** Epoch milliseconds (UTC), always a day boundary. */
  t: number;
  /** Uptime as a percentage (0-100). */
  uptime: number;
}

export interface PoolSeries {
  available: boolean;
  points: HashratePoint[];
  /** Daily-only, so its timestamps rarely match the hashrate points. */
  uptimePoints: UptimePoint[];
  granularity: TickSize;
  hasEfficiency: boolean;
  hasUptime: boolean;
  note?: string;
  error?: string;
}

export interface HashrateHistoryData {
  period: Period | null;
  tickSize: TickSize;
  /** Set when the preferred tick was too fine for how far back the window is. */
  downgradedFrom: TickSize | null;
  windowStart: string;
  windowEnd: string;
  /** Oldest point that can be paged back to, across both pools. */
  earliestData: string | null;
  activePoolNames: string[];
  pools: {
    luxor: PoolSeries;
    braiins: PoolSeries;
  };
}

interface HashrateHistoryResponse {
  success: boolean;
  data: HashrateHistoryData;
  error?: string;
  timestamp: string;
}

interface UseHashrateHistoryArgs {
  /** Window start — resolved in the viewer's timezone by the caller. */
  start: Date;
  /** Window end. */
  end: Date;
  /** Null for a custom range; only steers tick preference. */
  period: Period | null;
  /** True when this window runs up to "now" and should keep refreshing. */
  isLive: boolean;
  /** Privileged: admins and the owning franchisee. Omit for own data. */
  userId?: string;
}

/**
 * Per-client hashrate / share-efficiency history for the miners chart.
 *
 * Takes absolute instants rather than a period+offset: calendar buckets have
 * to be resolved in the browser's timezone, since the API runs in UTC.
 */
export const useHashrateHistory = ({
  start,
  end,
  period,
  isLive,
  userId,
}: UseHashrateHistoryArgs) => {
  const startIso = start.toISOString();
  // A live window's end moves every render; round it to the minute so the
  // query key is stable enough to actually hit cache.
  const endIso = new Date(
    Math.floor(end.getTime() / 60000) * 60000,
  ).toISOString();

  const { data, isLoading, isFetching, isError, error } =
    useQuery<HashrateHistoryResponse>({
      queryKey: [
        "hashrate-history",
        startIso,
        endIso,
        period,
        userId ?? "self",
      ],
      queryFn: async () => {
        const params = new URLSearchParams({ start: startIso, end: endIso });
        if (period) params.append("period", period);
        if (userId) params.append("userId", userId);

        const response = await fetch(`/api/miners/hashrate-history?${params}`);
        const body: HashrateHistoryResponse = await response.json();

        if (!response.ok || !body.success) {
          throw new Error(body.error || "Failed to fetch hashrate history");
        }

        return body;
      },
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      // Only the live window auto-refreshes — closed buckets never change.
      refetchInterval: isLive ? 5 * 60 * 1000 : false,
      placeholderData: (previous) => previous,
    });

  return {
    history: data?.data,
    isLoading,
    isFetching,
    isError,
    error:
      error instanceof Error ? error.message : error ? String(error) : null,
  };
};
