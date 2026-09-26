"use client";

/**
 * Hashprice History Page - BitFactory Daylight theme (v1.3)
 *
 * FEATURES:
 *
 * Statistics Cards (Top Section):
 * - Current Hashprice Card: Shows LIVE real-time hashprice from Luxor summary API (today's value, refreshes every 5 min)
 * - High/Low Card: Displays highest and lowest hashprice in selected period
 * - Hashprice Change Card: Shows price change from first to last day
 *   as both percentage and absolute value. Colour-coded via the success/danger tokens.
 * - Plus network-wide context cards (price, market cap, difficulty, halving, ...)
 *
 * Chart (Main Visualization):
 * - Hashprice Line: Main line showing actual pool hashprice movement (historical data) -
 *   kept Luxor/Binance-style gold, same reasoning as the BTC Price History chart.
 * - Area fill: Subtle gradient underneath for visual appeal
 *
 * Timeframe Selector:
 * - 1D: Last 24 hours
 * - 7D: Last 7 days
 * - 30D: Last 30 days
 * - 45D: Last 45 days
 * - 3M: Last 90 days
 * - 1Y: Last 365 days
 *
 * Data Sources:
 * - Current Hashprice: LIVE from /api/pool-hashprice-live (real-time Luxor summary API)
 * - Historical Chart: From /api/hashprice-history, reading PoolSubaccountDailySnapshot.hashprice
 *   (daily rows backfilled/gap-filled from Luxor for the user's own subaccount — see
 *   scripts/backfill-pool-history.js). Not capped at Luxor's live-API retention window
 *   since it's served from our own DB.
 * - Automatically refetches every 5 minutes
 * - Chart reflects the logged-in user's own Luxor subaccount, not a shared pool-wide figure
 */

import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  useMediaQuery,
} from "@mui/material";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  useHashpriceHistory,
  HashpricePoint,
} from "@/hooks/useHashpriceHistory";
import { useQuery } from "@tanstack/react-query";
import { useSubaccountFilter } from "@/lib/contexts/subaccountFilter-context";
import PillTab from "@/components/daylight/PillTab";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

interface ChartData {
  date: string;
  timestamp: number;
  hashprice: number | null;
}

const TIMEFRAMES = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "45D", days: 45 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 },
];

const formatHashprice = (value: number): string => {
  const formatted = value.toFixed(8);
  return `₿${formatted}`;
};

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatAdjustmentDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatUsd = (value: number): string =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Compact notation keeps large figures (market cap, difficulty) card-sized. */
const formatCompact = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);

const formatBlockTime = (ms: number): string => {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
};

/**
 * Shared card for every statistic on this page. A null value renders
 * "Unavailable"; `source` names the upstream API the figure came from, so the
 * provenance of each number is visible without consulting the footer. Kept
 * as a neutral canvas-tone card (rather than the dashboard's soft-colour
 * StatCard) since 13 of these at once would otherwise be a wall of pastel.
 */
function HashpriceStatCard({
  label,
  value,
  isLoading,
  source,
  color,
  caption,
}: {
  label: string;
  value: string | null;
  isLoading: boolean;
  source: string;
  color?: string;
  caption?: string;
}) {
  const { d, fonts } = useDaylight();

  return (
    <Box
      sx={{
        p: { xs: "10px", sm: "12px" },
        bgcolor: d.canvas,
        border: `1px solid ${d.border}`,
        borderRadius: "10px",
        display: "flex",
        flexDirection: "column",
        fontFamily: fonts.body,
      }}
    >
      <Typography
        sx={{ fontSize: { xs: 10, sm: 11 }, color: d.muted, lineHeight: 1.3 }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontWeight: 700,
          mt: "3px",
          fontSize: { xs: 13, sm: 15 },
          lineHeight: 1.3,
          // Five columns leaves each card narrow at the md breakpoint; wrapping
          // keeps longer values (High / Low, Period Change) inside the card.
          overflowWrap: "break-word",
          color: value == null ? d.muted : (color ?? d.text),
        }}
      >
        {isLoading ? (
          <CircularProgress size={16} sx={{ color: d.action }} />
        ) : (
          (value ?? "Unavailable")
        )}
      </Typography>
      {!isLoading && value != null && caption ? (
        <Typography
          sx={{
            display: "block",
            fontSize: { xs: 9, sm: 10 },
            lineHeight: 1.3,
            color: d.muted,
          }}
        >
          {caption}
        </Typography>
      ) : null}
      <Typography
        sx={{
          display: "block",
          mt: "auto",
          pt: "5px",
          fontSize: { xs: 9, sm: 10 },
          lineHeight: 1.3,
          color: d.muted,
          opacity: 0.85,
        }}
      >
        {source}
      </Typography>
    </Box>
  );
}

export default function HashpriceHistoryPage() {
  const { d, fonts } = useDaylight();
  const [selectedTimeframe, setSelectedTimeframe] = useState("30D");

  // Get days from selected timeframe
  const timeframeConfig = TIMEFRAMES.find(
    (tf) => tf.label === selectedTimeframe,
  );
  const days = timeframeConfig?.days || 30;
  const queryDays = selectedTimeframe === "1D" ? 2 : days;

  // Fetch live pool-wide hashprice (today's real-time value)
  const { data: liveData, isLoading: isLiveLoading } = useQuery({
    queryKey: ["pool-hashprice-live"],
    queryFn: async () => {
      const response = await fetch("/api/pool-hashprice-live");
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const liveHashprice = liveData?.data?.hashprice || 0;

  // Fetch network difficulty adjustment estimate (from mempool.space, since
  // Luxor's pool API does not expose network-wide difficulty data)
  const { data: difficultyData, isLoading: isDifficultyLoading } = useQuery({
    queryKey: ["difficulty-adjustment"],
    queryFn: async () => {
      const response = await fetch("/api/difficulty-adjustment");
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const estimatedChangePercent: number | undefined =
    difficultyData?.data?.estimatedChangePercent;
  const estimatedRetargetDate: number | undefined =
    difficultyData?.data?.estimatedRetargetDate;

  // Fetch Bitcoin network stats (price, market cap, block reward, difficulty,
  // block time, halving estimate, previous retarget)
  const { data: networkData, isLoading: isNetworkLoading } = useQuery({
    queryKey: ["network-stats"],
    queryFn: async () => {
      const response = await fetch("/api/network-stats");
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const network = networkData?.data;

  const { queryParam: subaccountsParam } = useSubaccountFilter();

  // Fetch historical pool-wide hashprice data from API (for chart and period statistics)
  const { hashpriceData, statistics, isLoading, isError, error, rawResponse } =
    useHashpriceHistory(queryDays, subaccountsParam);

  // Transform API data for chart
  const chartData: ChartData[] = useMemo(() => {
    // Show only actual returned days from API for all filters.
    return hashpriceData
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((point: HashpricePoint) => ({
        date: formatDate(point.timestamp),
        timestamp: point.timestamp,
        hashprice: point.hashprice,
      }));
  }, [hashpriceData]);

  const nonNullChartPoints = useMemo(
    () => chartData.filter((point) => point.hashprice !== null).length,
    [chartData],
  );

  const hasChartValues = useMemo(
    () => chartData.some((point) => point.hashprice !== null),
    [chartData],
  );

  // Calculate statistics from actual data
  const cardStatistics = useMemo(() => {
    if (hashpriceData.length === 0) {
      return {
        current: liveHashprice || 0, // Use live hashprice even if no historical data
        high: 0,
        low: 0,
        change: 0,
        changePercent: 0,
      };
    }

    // Use live hashprice for current (today's real-time value)
    // Use last historical point as previous for comparison
    const current =
      liveHashprice || hashpriceData[hashpriceData.length - 1].hashprice;
    const previous = hashpriceData[0].hashprice;
    const high = statistics.high;
    const low = statistics.low;
    const change = current - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0;

    return { current, high, low, change, changePercent };
  }, [hashpriceData, statistics, liveHashprice]);

  const isMobile = useMediaQuery("(max-width:599.95px)");
  const chartColor = "#f7b923"; // Binance/Luxor-style gold - kept as-is (see file header)

  return (
    <Box
      sx={{ maxWidth: 1600, mx: "auto", fontFamily: fonts.body, color: d.text }}
    >
      {/* Page heading */}
      <Box sx={{ mb: { xs: "20px", md: "26px" } }}>
        <Typography
          component="h1"
          sx={{
            fontFamily: fonts.heading,
            fontWeight: 750,
            fontSize: { xs: 27, md: 32 },
            lineHeight: 1.3,
            letterSpacing: "-.035em",
            color: d.text,
          }}
        >
          Hashprice History
        </Typography>
        <Typography
          sx={{ fontSize: { xs: 12, md: 13 }, color: d.muted, mt: "7px" }}
        >
          {isMobile
            ? "Your BTC hashprice from Luxor Mining"
            : "Your subaccount hashprice from Luxor Mining (BTC per PH/s per day) • Current: LIVE real-time • Chart: Historical"}
        </Typography>
      </Box>

      {/* Statistics cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr 1fr",
            sm: "repeat(3, 1fr)",
            md: "repeat(5, 1fr)",
          },
          gap: { xs: "8px", sm: "10px" },
          mb: { xs: "18px", sm: "22px" },
        }}
      >
        <HashpriceStatCard
          label="BTC Price"
          isLoading={isNetworkLoading}
          value={
            network?.btcPriceUsd != null ? formatUsd(network.btcPriceUsd) : null
          }
          source={`${network?.priceSource ?? "mempool.space"} · prices`}
        />

        <HashpriceStatCard
          label="Market Capitalization"
          isLoading={isNetworkLoading}
          value={
            network?.marketCapUsd != null
              ? `$${formatCompact(network.marketCapUsd)}`
              : null
          }
          caption="Price × issued supply"
          source={`${network?.priceSource ?? "mempool.space"} · mempool.space`}
        />

        <HashpriceStatCard
          label="Block Reward"
          isLoading={isNetworkLoading}
          value={
            network?.blockReward != null ? `${network.blockReward} BTC` : null
          }
          caption={
            network?.blockHeight != null
              ? `Block ${network.blockHeight.toLocaleString("en-US")}`
              : undefined
          }
          source="Derived · mempool.space height"
        />

        <HashpriceStatCard
          label="Network Difficulty"
          isLoading={isNetworkLoading}
          value={
            network?.networkDifficulty != null
              ? formatCompact(network.networkDifficulty)
              : null
          }
          source="mempool.space · mining/hashrate"
        />

        <HashpriceStatCard
          label="Avg Block Time"
          isLoading={isNetworkLoading}
          value={
            network?.avgBlockTimeMs != null
              ? formatBlockTime(network.avgBlockTimeMs)
              : null
          }
          caption="Current epoch • 10m target"
          source="mempool.space · difficulty-adjustment"
        />

        <HashpriceStatCard
          label="Halving Estimate"
          isLoading={isNetworkLoading}
          value={
            network?.halving?.estimatedDate != null
              ? formatAdjustmentDate(network.halving.estimatedDate)
              : null
          }
          caption={
            network?.halving?.blocksRemaining != null
              ? `${network.halving.blocksRemaining.toLocaleString("en-US")} blocks to go`
              : undefined
          }
          source="Derived · mempool.space height"
        />

        <HashpriceStatCard
          label="Previous Difficulty Adjustment"
          isLoading={isNetworkLoading}
          value={
            network?.previousRetargetPercent != null
              ? `${network.previousRetargetPercent >= 0 ? "+" : ""}${network.previousRetargetPercent.toFixed(2)}%`
              : null
          }
          // Rising difficulty cuts miner revenue, so it reads red — matching the
          // estimated adjustment card below.
          color={
            network?.previousRetargetPercent != null &&
            network.previousRetargetPercent > 0
              ? d.danger
              : d.success
          }
          source="mempool.space · difficulty-adjustment"
        />

        <HashpriceStatCard
          label="Current Hashprice"
          isLoading={isLiveLoading}
          value={formatHashprice(cardStatistics.current)}
          source="Luxor · pool-hashprice-live"
        />

        <HashpriceStatCard
          label="Period Change"
          isLoading={false}
          value={`${cardStatistics.change >= 0 ? "+" : ""}${
            isMobile
              ? `${cardStatistics.changePercent.toFixed(2)}%`
              : `${formatHashprice(cardStatistics.change)} (${cardStatistics.changePercent.toFixed(2)}%)`
          }`}
          color={cardStatistics.change >= 0 ? d.success : d.danger}
          source="Luxor · hashprice-history"
        />

        <HashpriceStatCard
          label="High / Low"
          isLoading={false}
          value={`${formatHashprice(cardStatistics.high)} / ${formatHashprice(cardStatistics.low)}`}
          source="Luxor · hashprice-history"
        />

        <HashpriceStatCard
          label="Est. Difficulty Adjustment"
          isLoading={isDifficultyLoading}
          value={
            estimatedChangePercent == null
              ? null
              : `${estimatedChangePercent >= 0 ? "+" : ""}${estimatedChangePercent.toFixed(2)}%`
          }
          color={
            estimatedChangePercent != null && estimatedChangePercent > 0
              ? d.danger
              : d.success
          }
          source="mempool.space · difficulty-adjustment"
        />

        <HashpriceStatCard
          label="Difficulty Adjustment Date Estimate"
          isLoading={isDifficultyLoading}
          value={
            estimatedRetargetDate == null
              ? null
              : formatAdjustmentDate(estimatedRetargetDate)
          }
          source="mempool.space · difficulty-adjustment"
        />
      </Box>

      {/* Chart card */}
      <Box
        sx={{
          p: { xs: "16px 12px", sm: "20px 24px" },
          bgcolor: d.surface,
          border: `1px solid ${d.border}`,
          borderRadius: RADIUS_CARD,
          boxShadow: d.shadow,
          mb: { xs: "18px", sm: "22px" },
        }}
      >
        {/* Timeframe selector */}
        <Box
          sx={{
            mb: { xs: "16px", sm: "20px" },
            display: "flex",
            gap: "4px",
            flexWrap: "wrap",
          }}
        >
          {TIMEFRAMES.map((timeframe) => (
            <PillTab
              key={timeframe.label}
              active={selectedTimeframe === timeframe.label}
              onClick={() => setSelectedTimeframe(timeframe.label)}
            >
              {timeframe.label}
            </PillTab>
          ))}
        </Box>

        {/* Data coverage note */}
        {!isLoading && hashpriceData.length > 0 && (
          <Box
            sx={{
              mb: "16px",
              p: "10px 12px",
              bgcolor: d.skySoft,
              border: `1px solid ${d.borderSky}`,
              borderRadius: "8px",
            }}
          >
            <Typography
              sx={{ fontSize: 11, color: d.action, fontFamily: fonts.body }}
            >
              📊 Data: {hashpriceData.length} days returned | Requested:{" "}
              {queryDays} days |
              {hashpriceData.length < queryDays
                ? " ⚠️ Limited history"
                : " ✓ Full period"}
            </Typography>
          </Box>
        )}

        {/* Loading state */}
        {isLoading && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "400px",
            }}
          >
            <CircularProgress sx={{ color: d.action }} />
          </Box>
        )}

        {/* Error state */}
        {isError && (
          <Alert
            severity="error"
            sx={{
              mb: 2,
              borderRadius: "8px",
              bgcolor: d.dangerSoft,
              color: d.danger,
              fontFamily: fonts.body,
              "& .MuiAlert-icon": { color: d.danger },
            }}
          >
            <Typography
              sx={{ fontWeight: 700, fontSize: 13, fontFamily: fonts.body }}
            >
              Failed to load hashprice data
            </Typography>
            <Typography sx={{ fontSize: 12, fontFamily: fonts.body }}>
              {error}
            </Typography>
            <Typography
              sx={{
                mt: 1,
                display: "block",
                fontSize: 11,
                fontFamily: fonts.body,
              }}
            >
              Please try again or refresh the page.
            </Typography>
          </Alert>
        )}

        {/* Chart */}
        {!isLoading && !isError && hasChartValues && (
          <ResponsiveContainer width="100%" height={isMobile ? 260 : 400}>
            <AreaChart
              data={chartData}
              margin={{ left: isMobile ? 0 : 10, right: isMobile ? 4 : 10 }}
            >
              <defs>
                <linearGradient id="colorHashprice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.4} />
                  <stop
                    offset="50%"
                    stopColor={chartColor}
                    stopOpacity={0.15}
                  />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={d.border} />
              <XAxis
                dataKey="date"
                stroke={d.border}
                tick={{
                  fontSize: isMobile ? 9 : 12,
                  fill: d.muted,
                  fontFamily: fonts.body,
                }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke={d.border}
                tick={{
                  fontSize: isMobile ? 8 : 11,
                  fill: d.muted,
                  fontFamily: fonts.body,
                }}
                tickFormatter={(value) => {
                  if (value === 0) return "0";
                  if (isMobile) return value.toExponential(1);
                  if (value < 0.00000001) return "<0.00000001";
                  return value.toFixed(8);
                }}
                domain={["dataMin", "dataMax"]}
                width={isMobile ? 56 : 110}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: d.surface,
                  border: `2px solid ${chartColor}`,
                  borderRadius: "10px",
                  color: d.text,
                  padding: "12px",
                  boxShadow: "0 8px 30px rgba(100,114,124,.13)",
                  fontSize: "0.85rem",
                  fontFamily: fonts.body,
                }}
                formatter={(value) => {
                  const numValue =
                    typeof value === "string"
                      ? parseFloat(value)
                      : typeof value === "number"
                        ? value
                        : undefined;
                  return [
                    numValue == null ? "" : formatHashprice(numValue),
                    "Hashprice",
                  ];
                }}
                labelFormatter={(date) => `📅 Date: ${date}`}
                separator=" = "
              />
              <Legend
                wrapperStyle={{
                  color: d.muted,
                  fontFamily: fonts.body,
                  fontSize: 12,
                }}
                iconType="line"
                height={20}
              />

              {/* Golden area fill for hashprice (Luxor style) */}
              <Area
                type="monotone"
                dataKey="hashprice"
                stroke={chartColor}
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorHashprice)"
                dot={
                  nonNullChartPoints <= 2
                    ? { r: 4, fill: chartColor, strokeWidth: 0 }
                    : false
                }
                connectNulls
                activeDot={{ r: 6, fill: chartColor, opacity: 1 }}
                name="Hashprice (BTC/PH/s/Day)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Empty state */}
        {!isLoading && !isError && !hasChartValues && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "400px",
            }}
          >
            <Typography
              sx={{ fontSize: 13, color: d.muted, fontFamily: fonts.body }}
            >
              {rawResponse?.message ||
                "No data available. Please check your connection and try again."}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Info footer */}
      <Box
        sx={{
          p: { xs: "12px 14px", sm: "14px 16px" },
          borderRadius: RADIUS_CARD,
          bgcolor: d.skySoft,
          border: `1px solid ${d.borderSky}`,
        }}
      >
        <Typography
          sx={{ display: "block", fontSize: 11, color: d.text, opacity: 0.9 }}
        >
          Daily snapshots stored in our database, sourced from Luxor for your
          subaccount — may lag the live hashprice above.
        </Typography>
      </Box>
    </Box>
  );
}
