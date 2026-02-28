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
  Stack,
  useTheme,
  Container,
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
  hashprice: number;
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

export default function HashpriceHistoryPage() {
  const theme = useTheme();
  const [selectedTimeframe, setSelectedTimeframe] = useState("1M");

  // Get days from selected timeframe
  const timeframeConfig = TIMEFRAMES.find(
    (tf) => tf.label === selectedTimeframe,
  );
  const days = timeframeConfig?.days || 30;

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

  // Fetch historical pool-wide hashprice data from API (for chart and period statistics)
  const { hashpriceData, statistics, isLoading, isError, error } =
    useHashpriceHistory(days);

  // Transform API data for chart
  const chartData: ChartData[] = useMemo(() => {
    return hashpriceData.map((point: HashpricePoint) => ({
      date: formatDate(point.timestamp),
      timestamp: point.timestamp,
      hashprice: point.hashprice,
    }));
  }, [hashpriceData]);

  // Calculate statistics from actual data
  const cardStatistics = useMemo(() => {
    if (chartData.length === 0) {
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
    const current = liveHashprice || chartData[chartData.length - 1].hashprice;
    const previous = chartData[0].hashprice;
    const high = statistics.high;
    const low = statistics.low;
    const change = current - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0;

    return { current, high, low, change, changePercent };
  }, [chartData, statistics, liveHashprice]);

  const isDark = theme.palette.mode === "dark";
  const chartColor = "#f7b923"; // Binance-style gold
  const gridColor = isDark ? "#444" : "#e0e0e0";
  const textColor = isDark ? "#fff" : "#000";

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontWeight: "bold", mb: 1 }}
        >
          Hashprice History
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Pool-wide hashprice data from Luxor Mining (BTC per PH/s per day) •
          Current: LIVE real-time (Luxor summary) • Chart: Historical calculated
          from daily revenue ÷ daily hashrate
        </Typography>
      </Box>

      {/* Statistics Cards Section */}
      {/*
        These cards show key metrics:
        1. Current Hashprice: Live real-time hashprice from Luxor API
        2. Period Change: Hashprice change from start to end of selected timeframe
        3. High/Low: Price range during entire selected period
      */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 4 }}>
        <Paper
          sx={{
            p: 2,
            flex: 1,
            backgroundColor: isDark ? theme.palette.grey[800] : "#f5f5f5",
            borderRadius: 2,
          }}
        >
          <Typography variant="caption" color="textSecondary">
            Current Hashprice
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: "bold", mt: 0.5 }}>
            {isLiveLoading ? (
              <CircularProgress size={20} />
            ) : (
              formatHashprice(cardStatistics.current)
            )}
          </Typography>
        </Paper>

        <Paper
          sx={{
            p: 2,
            flex: 1,
            backgroundColor: isDark ? theme.palette.grey[800] : "#f5f5f5",
            borderRadius: 2,
          }}
        >
          <Typography variant="caption" color="textSecondary">
            Period Change
          </Typography>
          <Typography
            variant="h6"
            sx={{
              fontWeight: "bold",
              mt: 0.5,
              color: cardStatistics.change >= 0 ? "#4caf50" : "#f44336",
            }}
          >
            {cardStatistics.change >= 0 ? "+" : ""}
            {formatHashprice(cardStatistics.change)} (
            {cardStatistics.changePercent.toFixed(2)}%)
          </Typography>
        </Paper>

        <Paper
          sx={{
            p: 2,
            flex: 1,
            backgroundColor: isDark ? theme.palette.grey[800] : "#f5f5f5",
            borderRadius: 2,
          }}
        >
          <Typography variant="caption" color="textSecondary">
            High / Low
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: "bold", mt: 0.5 }}>
            {formatHashprice(cardStatistics.high)} /{" "}
            {formatHashprice(cardStatistics.low)}
          </Typography>
        </Paper>
      </Stack>

      {/* Chart Section */}
      {/*
        Main visualization showing hashprice movement:
        - Golden line: Close price (primary indicator)
        - Area fill: Gradient underneath for visual appeal
      */}
      <Paper
        sx={{
          p: 3,
          borderRadius: 2,
          backgroundColor: isDark ? theme.palette.grey[900] : "#ffffff",
        }}
      >
        {/* Timeframe Selector Buttons */}
        {/*
          Users can switch between 4 different timeframes:
          - 1D (1 day), 7D (7 days), 30D (30 days)
          - 45D (max Luxor API history limit)
        */}
        <Box sx={{ mb: 3, display: "flex", gap: 1, flexWrap: "wrap" }}>
          {TIMEFRAMES.map((timeframe) => (
            <Button
              key={timeframe.label}
              onClick={() => setSelectedTimeframe(timeframe.label)}
              variant={
                selectedTimeframe === timeframe.label ? "contained" : "outlined"
              }
              size="small"
              sx={{
                minWidth: "60px",
                fontSize: "0.8rem",
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
              📊 Data: {hashpriceData.length} days returned | Requested: {days}{" "}
              days |
              {hashpriceData.length < days
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
        {!isLoading && !isError && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={chartData}>
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
                style={{ fontSize: "0.8rem" }}
              />
              <YAxis
                stroke={textColor}
                style={{ fontSize: "0.75rem" }}
                tickFormatter={(value) => {
                  if (value === 0) return "0";
                  if (value < 0.00000001) return "<0.00000001";
                  return value.toFixed(8);
                }}
                domain={["dataMin", "dataMax"]}
                width={110}
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
                dot={false}
                activeDot={{ r: 6, fill: chartColor, opacity: 1 }}
                name="Hashprice (BTC/PH/s/Day)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Empty State */}
        {!isLoading && !isError && chartData.length === 0 && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "400px",
            }}
          >
            <Typography color="textSecondary">
              No data available. Please check your connection and try again.
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
          p: 2,
          mt: 3,
          borderRadius: 2,
          backgroundColor: isDark ? theme.palette.grey[800] : "#f5f5f5",
        }}
      >
        <Typography variant="body2" color="textSecondary">
          <strong>Data Source:</strong> Luxor Mining Pool (pool-specific
          hashprice) • Calculated from: Daily Revenue ÷ Daily Hashrate • Updated
          every 5 minutes • All values in BTC/PH/s/Day
        </Typography>
      </Paper>
    </Container>
  );
}
