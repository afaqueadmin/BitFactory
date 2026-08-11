"use client";

/**
 * Hashprice History Page
 *
 * FEATURES:
 *
 * Statistics Cards (Top Section):
 * - Current Hashprice Card: Shows LIVE real-time hashprice from Luxor summary API (today's value, refreshes every 5 min)
 * - High/Low Card: Displays highest and lowest hashprice in selected period
 * - Hashprice Change Card: Shows price change from first to last day
 *   as both percentage and absolute value. Color-coded: green if up, red if down
 *
 * Chart (Main Visualization):
 * - Hashprice Line: Main line showing actual pool hashprice movement (historical data)
 * - Area fill: Subtle gradient underneath for visual appeal
 *
 * Timeframe Selector:
 * - 1D: Last 24 hours
 * - 7D: Last 7 days
 * - 30D: Last 30 days
 * - 45D: Last 45 days (Luxor API historical limit)
 *
 * Data Sources:
 * - Current Hashprice: LIVE from /api/pool-hashprice-live (real-time Luxor summary API)
 * - Historical Chart: From /api/hashprice-history (pool-wide daily revenue ÷ daily hashrate)
 * - Automatically refetches every 5 minutes
 * - Shows pool-wide hashprice (same value for all users from 'higgs' main account)
 */

import React, { useState, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Button,
  useTheme,
  useMediaQuery,
  SxProps,
  Theme,
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

interface ChartData {
  date: string;
  timestamp: number;
  hashprice: number | null;
}

const TIMEFRAMES = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "45D", days: 45 }, // Luxor API max historical data is ~45 days
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
 * provenance of each number is visible without consulting the footer.
 */
function StatCard({
  label,
  value,
  isLoading,
  source,
  color,
  caption,
  sx,
}: {
  label: string;
  value: string | null;
  isLoading: boolean;
  source: string;
  color?: string;
  caption?: string;
  sx?: SxProps<Theme>;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Paper
      sx={{
        p: { xs: 1.25, sm: 1.5 },
        backgroundColor: isDark ? theme.palette.grey[800] : "#f5f5f5",
        borderRadius: 1.5,
        display: "flex",
        flexDirection: "column",
        ...sx,
      }}
    >
      <Typography
        variant="caption"
        color="textSecondary"
        sx={{ fontSize: { xs: "0.68rem", sm: "0.78rem" }, lineHeight: 1.3 }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontWeight: "bold",
          mt: 0.4,
          fontSize: { xs: "0.9rem", sm: "1.1rem" },
          lineHeight: 1.3,
          // Five columns leaves each card narrow at the md breakpoint; wrapping
          // keeps longer values (High / Low, Period Change) inside the card.
          overflowWrap: "break-word",
          color: value == null ? "inherit" : (color ?? "inherit"),
        }}
      >
        {isLoading ? <CircularProgress size={16} /> : (value ?? "Unavailable")}
      </Typography>
      {!isLoading && value != null && caption ? (
        <Typography
          variant="caption"
          color="textSecondary"
          sx={{
            display: "block",
            fontSize: { xs: "0.62rem", sm: "0.68rem" },
            lineHeight: 1.3,
          }}
        >
          {caption}
        </Typography>
      ) : null}
      <Typography
        variant="caption"
        color="textSecondary"
        sx={{
          display: "block",
          mt: "auto",
          pt: 0.6,
          fontSize: { xs: "0.58rem", sm: "0.63rem" },
          lineHeight: 1.3,
          opacity: 0.75,
        }}
      >
        {source}
      </Typography>
    </Paper>
  );
}

export default function HashpriceHistoryPage() {
  const theme = useTheme();
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

  // Fetch historical pool-wide hashprice data from API (for chart and period statistics)
  const { hashpriceData, statistics, isLoading, isError, error, rawResponse } =
    useHashpriceHistory(queryDays);

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

  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isDark = theme.palette.mode === "dark";
  const chartColor = "#f7b923"; // Binance-style gold
  const gridColor = isDark ? "#444" : "#e0e0e0";
  const textColor = isDark ? "#fff" : "#000";

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, mt: { xs: 1, md: 2 } }}>
      {/* Header */}
      <Box sx={{ mb: { xs: 2, md: 4 } }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontWeight: "bold",
            mb: 0.5,
            fontSize: { xs: "1.6rem", sm: "2rem", md: "2.125rem" },
          }}
        >
          Hashprice History
        </Typography>
        <Typography variant="body2" color="textSecondary">
          {isMobile
            ? "Pool-wide BTC hashprice from Luxor Mining"
            : "Pool-wide hashprice data from Luxor Mining (BTC per PH/s per day) • Current: LIVE real-time • Chart: Historical"}
        </Typography>
      </Box>

      {/* Statistics Cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr 1fr",
            sm: "repeat(3, 1fr)",
            md: "repeat(5, 1fr)",
          },
          gap: { xs: 1, sm: 1.25 },
          mb: { xs: 2, md: 4 },
        }}
      >
        <StatCard
          label="BTC Price"
          isLoading={isNetworkLoading}
          value={
            network?.btcPriceUsd != null ? formatUsd(network.btcPriceUsd) : null
          }
          source={`${network?.priceSource ?? "mempool.space"} · prices`}
        />

        <StatCard
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

        <StatCard
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

        <StatCard
          label="Network Difficulty"
          isLoading={isNetworkLoading}
          value={
            network?.networkDifficulty != null
              ? formatCompact(network.networkDifficulty)
              : null
          }
          source="mempool.space · mining/hashrate"
        />

        <StatCard
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

        <StatCard
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

        <StatCard
          label="Previous Difficulty Adjustment"
          isLoading={isNetworkLoading}
          value={
            network?.previousRetargetPercent != null
              ? `${network.previousRetargetPercent >= 0 ? "+" : ""}${network.previousRetargetPercent.toFixed(2)}%`
              : null
          }
          // Rising difficulty cuts miner revenue, so it reads red — matching the
          // estimated adjustment card above.
          color={
            network?.previousRetargetPercent != null &&
            network.previousRetargetPercent > 0
              ? "#f44336"
              : "#4caf50"
          }
          source="mempool.space · difficulty-adjustment"
        />

        <StatCard
          label="Current Hashprice"
          isLoading={isLiveLoading}
          value={formatHashprice(cardStatistics.current)}
          source="Luxor · pool-hashprice-live"
        />

        <StatCard
          label="Period Change"
          isLoading={false}
          value={`${cardStatistics.change >= 0 ? "+" : ""}${
            isMobile
              ? `${cardStatistics.changePercent.toFixed(2)}%`
              : `${formatHashprice(cardStatistics.change)} (${cardStatistics.changePercent.toFixed(2)}%)`
          }`}
          color={cardStatistics.change >= 0 ? "#4caf50" : "#f44336"}
          source="Luxor · hashprice-history"
        />

        <StatCard
          label="High / Low"
          isLoading={false}
          value={`${formatHashprice(cardStatistics.high)} / ${formatHashprice(cardStatistics.low)}`}
          source="Luxor · hashprice-history"
        />

        <StatCard
          label="Est. Difficulty Adjustment"
          isLoading={isDifficultyLoading}
          value={
            estimatedChangePercent == null
              ? null
              : `${estimatedChangePercent >= 0 ? "+" : ""}${estimatedChangePercent.toFixed(2)}%`
          }
          color={
            estimatedChangePercent != null && estimatedChangePercent > 0
              ? "#f44336"
              : "#4caf50"
          }
          source="mempool.space · difficulty-adjustment"
        />

        <StatCard
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

      {/* Chart Section */}
      {/*
        Main visualization showing hashprice movement:
        - Golden line: Close price (primary indicator)
        - Area fill: Gradient underneath for visual appeal
      */}
      <Paper
        sx={{
          p: { xs: 1.5, sm: 3 },
          borderRadius: 2,
          backgroundColor: isDark ? theme.palette.grey[900] : "#ffffff",
        }}
      >
        {/* Timeframe Selector Buttons */}
        <Box
          sx={{
            mb: { xs: 2, sm: 3 },
            display: "flex",
            gap: 0.75,
            flexWrap: "wrap",
          }}
        >
          {TIMEFRAMES.map((timeframe) => (
            <Button
              key={timeframe.label}
              onClick={() => setSelectedTimeframe(timeframe.label)}
              variant={
                selectedTimeframe === timeframe.label ? "contained" : "outlined"
              }
              size="small"
              sx={{
                minWidth: { xs: "40px", sm: "60px" },
                px: { xs: 1, sm: 1.5 },
                fontSize: { xs: "0.7rem", sm: "0.8rem" },
                textTransform: "uppercase",
              }}
            >
              {timeframe.label}
            </Button>
          ))}
        </Box>

        {/* Debug Info - Shows actual data returned */}
        {!isLoading && hashpriceData.length > 0 && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: "info.lighter", borderRadius: 1 }}>
            <Typography
              variant="caption"
              sx={{ fontSize: "0.7rem", color: "info.main" }}
            >
              📊 Data: {hashpriceData.length} days returned | Requested:{" "}
              {queryDays} days |
              {hashpriceData.length < queryDays
                ? ` ⚠️ Limited history`
                : ` ✓ Full period`}
            </Typography>
          </Box>
        )}

        {/* Loading State */}
        {isLoading && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "400px",
            }}
          >
            <CircularProgress />
          </Box>
        )}

        {/* Error State */}
        {isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
              Failed to load hashprice data
            </Typography>
            <Typography variant="body2">{error}</Typography>
            <Typography variant="caption" sx={{ mt: 1, display: "block" }}>
              Please try again or refresh the page.
            </Typography>
          </Alert>
        )}

        {/* Chart Visualization */}
        {/*
          Real historical hashprice chart showing:
          - Golden line: Calculated hashprice from Luxor API data
          - Area fill: Gradient underneath for visual appeal
          - Grid: Gridlines for reference

          Data is calculated from: Daily Revenue ÷ Daily Hashrate
          Updates automatically every 5 minutes
        */}
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
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis
                dataKey="date"
                stroke={textColor}
                tick={{ fontSize: isMobile ? 9 : 12 }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke={textColor}
                tick={{ fontSize: isMobile ? 8 : 11 }}
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
                  backgroundColor: isDark ? "#333" : "#fff",
                  border: `2px solid ${chartColor}`,
                  borderRadius: "8px",
                  color: textColor,
                  padding: "12px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  fontSize: "0.85rem",
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
                wrapperStyle={{ color: textColor }}
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

        {/* Empty State */}
        {!isLoading && !isError && !hasChartValues && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "400px",
            }}
          >
            <Typography color="textSecondary">
              {rawResponse?.message ||
                "No data available. Please check your connection and try again."}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Info Section */}
      {/*
        Footer with data source information:
        - Luxor Mining Pool API for pool-specific hashprice
        - Calculated from: Daily Revenue ÷ Daily Hashrate
        - Real historical data (not simulated)
      */}
      <Paper
        sx={{
          p: { xs: 1.5, sm: 2 },
          mt: { xs: 2, md: 3 },
          borderRadius: 2,
          backgroundColor: isDark ? theme.palette.grey[800] : "#f5f5f5",
        }}
      >
        <Typography variant="body2" color="textSecondary">
          <strong>Data Source:</strong> Luxor Mining Pool •{" "}
          {isMobile
            ? "BTC/PH/s/Day • Updates every 5 min"
            : "Calculated from: Daily Revenue ÷ Daily Hashrate • Updated every 5 minutes • All values in BTC/PH/s/Day"}
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
          <strong>Network Data:</strong> mempool.space (difficulty, block time,
          height, price) • CoinGecko fallback • Updated every 5 minutes
        </Typography>
      </Paper>
    </Box>
  );
}
