"use client";

/**
 * Hashprice History Page
 *
 * FEATURES:
 *
 * Statistics Cards (Top Section):
 * - Current Hashprice Card: Shows the latest pool hashprice (BTC per PH/s per day)
 * - High/Low Card: Displays highest and lowest hashprice in selected period
 * - Hashprice Change Card: Shows price change from first to last day
 *   as both percentage and absolute value. Color-coded: green if up, red if down
 *
 * Chart (Main Visualization):
 * - Hashprice Line: Main line showing actual pool hashprice movement
 * - Area fill: Subtle gradient underneath for visual appeal
 *
 * Timeframe Selector:
 * - 1D: Last 24 hours (if available)
 * - 1W: Last 7 days
 * - 1M: Last 30 days
 * - 3M: Last 90 days
 * - 1Y: Last 365 days
 * - ALL: Last available year of data
 *
 * Data Source:
 * - Luxor Mining Pool API (pool-specific hashprice)
 * - Calculated from: Daily Revenue ÷ Daily Hashrate
 * - Automatically refetches every 5 minutes
 * - Shows your mining pool's actual hashprice for miners
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

interface ChartData {
  date: string;
  timestamp: number;
  hashprice: number;
}

const TIMEFRAMES = [
  { label: "1D", days: 1 },
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 },
  { label: "ALL", days: 365 }, // Use max 365 days
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

  // Fetch real hashprice history data from API
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
        current: 0,
        high: 0,
        low: 0,
        change: 0,
        changePercent: 0,
      };
    }

    const current = chartData[chartData.length - 1].hashprice;
    const previous = chartData[0].hashprice;
    const high = statistics.high;
    const low = statistics.low;
    const change = current - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0;

    return { current, high, low, change, changePercent };
  }, [chartData, statistics]);

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
          Pool hashprice data from Luxor Mining (BTC per PH/s per day) •
          Calculated from daily revenue ÷ daily hashrate
        </Typography>
      </Box>

      {/* Statistics Cards Section */}
      {/*
        These cards show key metrics:
        1. Current Hashprice: Latest hashprice value from calculated data
        2. Period Change: Hashprice change from start to end of selected timeframe
        3. High/Low: Price range during entire selected period
      */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 4 }}>
        <Paper
          sx={{
            p: 2.5,
            flex: 1,
            backgroundColor: isDark ? theme.palette.grey[800] : "#f5f5f5",
            borderRadius: 2,
            border: `1px solid ${isDark ? theme.palette.grey[700] : "#e0e0e0"}`,
          }}
        >
          <Typography
            variant="caption"
            color="textSecondary"
            sx={{ fontSize: "0.75rem", fontWeight: "600" }}
          >
            CURRENT HASHPRICE
          </Typography>
          <Typography
            variant="h5"
            sx={{ fontWeight: "bold", mt: 1, fontSize: "1.75rem" }}
          >
            {formatHashprice(cardStatistics.current)}
          </Typography>
          <Typography
            variant="caption"
            color="textSecondary"
            sx={{ display: "block", mt: 0.75, fontSize: "0.7rem" }}
          >
            per PH/s per day
          </Typography>
        </Paper>

        <Paper
          sx={{
            p: 2.5,
            flex: 1,
            backgroundColor: isDark ? theme.palette.grey[800] : "#f5f5f5",
            borderRadius: 2,
            border: `1px solid ${isDark ? theme.palette.grey[700] : "#e0e0e0"}`,
          }}
        >
          <Typography
            variant="caption"
            color="textSecondary"
            sx={{ fontSize: "0.75rem", fontWeight: "600" }}
          >
            PERIOD CHANGE
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Typography
              variant="h5"
              sx={{
                fontWeight: "bold",
                fontSize: "1.75rem",
                color: cardStatistics.change >= 0 ? "#4caf50" : "#f44336",
              }}
            >
              {cardStatistics.change >= 0 ? "+" : ""}
              {formatHashprice(cardStatistics.change)}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                fontSize: "0.85rem",
                color: cardStatistics.change >= 0 ? "#4caf50" : "#f44336",
                fontWeight: "600",
                mt: 0.3,
                display: "block",
              }}
            >
              {cardStatistics.change >= 0 ? "↑" : "↓"}{" "}
              {cardStatistics.changePercent.toFixed(2)}%
            </Typography>
          </Box>
        </Paper>

        <Paper
          sx={{
            p: 2.5,
            flex: 1,
            backgroundColor: isDark ? theme.palette.grey[800] : "#f5f5f5",
            borderRadius: 2,
            border: `1px solid ${isDark ? theme.palette.grey[700] : "#e0e0e0"}`,
          }}
        >
          <Typography
            variant="caption"
            color="textSecondary"
            sx={{ fontSize: "0.75rem", fontWeight: "600" }}
          >
            HIGH / LOW
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Box sx={{ mb: 1.5 }}>
              <Typography
                variant="caption"
                color="textSecondary"
                sx={{ fontSize: "0.7rem" }}
              >
                24h High
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: "bold",
                  color: "#4caf50",
                  fontSize: "1rem",
                  mt: 0.3,
                }}
              >
                {formatHashprice(cardStatistics.high)}
              </Typography>
            </Box>
            <Box>
              <Typography
                variant="caption"
                color="textSecondary"
                sx={{ fontSize: "0.7rem" }}
              >
                24h Low
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: "bold",
                  color: "#f44336",
                  fontSize: "1rem",
                  mt: 0.3,
                }}
              >
                {formatHashprice(cardStatistics.low)}
              </Typography>
            </Box>
          </Box>
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
          Users can switch between 6 different timeframes:
          - 1D (1 day), 1W (7 days), 1M (30 days)
          - 3M (90 days), 1Y (365 days), ALL (365 days max)
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
                formatter={(value: number) => [
                  formatHashprice(value),
                  "Hashprice",
                ]}
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
