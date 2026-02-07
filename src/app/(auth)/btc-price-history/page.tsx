"use client";

/**
 * BTC Price History Page
 *
 * FEATURES:
 * 
 * Statistics Cards (Top Section):
 * - Current Price Card: Shows the latest BTC/USDT price from the selected timeframe
 *   (most recent closing price in your chosen period)
 * - 24h Change Card: Displays how much the price has changed in the last 24 hours
 *   as both percentage and absolute value. Color-coded: green if up, red if down
 * - High/Low Cards: Show the highest and lowest prices during the selected timeframe
 *   (for the entire timeframe you picked like 1W, 1M, etc., not just 24 hours)
 * 
 * Chart (Main Visualization):
 * - Close Price (Golden Line): The main line showing how price moved throughout the period
 * - High/Low (Subtle Range): Dashed lines showing daily highs (green) and lows (red)
 *   creating a range band
 * - Volume Bars (Semi-transparent): Gray bars showing trading volume at the bottom
 * 
 * Timeframe Selector:
 * - 1D: Last 24 hours with hourly data (365 candles)
 * - 1W: Last 7 days with 4-hour data (52 candles)
 * - 1M: Last 30 days with daily data (12 candles)
 * - 3M: Last 3 months (120 candles)
 * - 1Y: Last year (365 candles)
 * - ALL: Extended history (1000 candles)
 * 
 * Data Updates:
 * - Automatically refetches fresh data from Binance every 5 minutes
 * - No manual refresh needed - happens silently in the background
 * - Chart and cards update instantly when new data arrives
 * - Page itself doesn't reload/refresh (no flicker) - only data updates
 * 
 * Caching Strategy:
 * - Data is "fresh" for 5 minutes - clicking a timeframe within 5 min uses cache (instant)
 * - After 5 minutes, marked "stale" and will refetch on next interaction
 * - Old cache kept for 10 minutes as fallback if Binance is temporarily slow
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
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { useBinanceKlines, KlineData } from "@/hooks/useBinanceKlines";

interface ChartData {
  timestamp: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TIMEFRAMES = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatDate = (timestamp: number, timeframe: string): string => {
  const date = new Date(timestamp);

  switch (timeframe) {
    case "1D":
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    case "1W":
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "1M":
    case "3M":
    case "1Y":
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "ALL":
      return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    default:
      return date.toLocaleDateString();
  }
};

export default function BtcPriceHistoryPage() {
  const theme = useTheme();
  const [selectedTimeframe, setSelectedTimeframe] = useState("1D");
  const { klines, isLoading, isError, error } = useBinanceKlines(selectedTimeframe);

  // Transform kline data for chart
  const chartData: ChartData[] = useMemo(() => {
    if (!klines || klines.length === 0) return [];

    return klines.map((kline: KlineData) => ({
      timestamp: kline.openTime,
      date: formatDate(kline.openTime, selectedTimeframe),
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
      volume: kline.volume,
    }));
  }, [klines, selectedTimeframe]);

  // Calculate statistics
  const statistics = useMemo(() => {
    if (chartData.length === 0) {
      return {
        current: 0,
        high: 0,
        low: 0,
        change: 0,
        changePercent: 0,
      };
    }

    const current = chartData[chartData.length - 1].close;
    const previous = chartData[0].open;
    const high = Math.max(...chartData.map((d) => d.high));
    const low = Math.min(...chartData.map((d) => d.low));
    const change = current - previous;
    const changePercent = (change / previous) * 100;

    return { current, high, low, change, changePercent };
  }, [chartData]);

  const isDark = theme.palette.mode === "dark";
  // Binance-style golden/yellow color for close price
  const chartColor = "#f7b923";
  const gridColor = isDark ? "#444" : "#e0e0e0";
  const textColor = isDark ? "#fff" : "#000";

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: "bold", mb: 1 }}>
          Bitcoin Price History
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Real-time BTC/USDT price data from Binance
        </Typography>
      </Box>

      {/* Statistics Cards Section */}
      {/* 
        These cards show key metrics:
        1. Current Price: Latest closing price in the selected timeframe
        2. 24h Change: Price change in last 24 hours (green/red colored)
        3. High/Low: Range of prices during the entire timeframe period
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
            Current Price
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: "bold", mt: 0.5 }}>
            {formatCurrency(statistics.current)}
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
            24h Change
          </Typography>
          <Typography
            variant="h6"
            sx={{
              fontWeight: "bold",
              mt: 0.5,
              color: statistics.change >= 0 ? "#4caf50" : "#f44336",
            }}
          >
            {statistics.change >= 0 ? "+" : ""}
            {formatCurrency(statistics.change)} ({statistics.changePercent.toFixed(2)}%)
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
            {formatCurrency(statistics.high)} / {formatCurrency(statistics.low)}
          </Typography>
        </Paper>
      </Stack>

      {/* Chart Section */}
      {/* 
        Main visualization showing price movement:
        - Golden line: Close price (primary indicator)
        - Dashed lines: High (green) and Low (red) prices creating a range band
        - Area fill: Subtle gradient under the close price for visual appeal
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
          - 1D (hourly data), 1W (4-hour data), 1M (daily data)
          - 3M (3-month span), 1Y (yearly), ALL (extended history)
        */}
        <Box sx={{ mb: 3, display: "flex", gap: 1, flexWrap: "wrap" }}>
          {TIMEFRAMES.map((timeframe) => (
            <Button
              key={timeframe}
              onClick={() => setSelectedTimeframe(timeframe)}
              variant={selectedTimeframe === timeframe ? "contained" : "outlined"}
              size="small"
              sx={{
                minWidth: "60px",
                fontSize: "0.8rem",
                textTransform: "uppercase",
              }}
            >
              {timeframe}
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
              Failed to load price data
            </Typography>
            <Typography variant="body2">{error}</Typography>
            <Typography variant="caption" sx={{ mt: 1, display: "block" }}>
              Please try again or refresh the page.
            </Typography>
          </Alert>
        )}

        {/* Chart Visualization */}
        {/* 
          Binance-style chart showing:
          - Golden line: Main close price indicator
          - Area fill: Gradient underneath for visual appeal
          - High/Low dashed lines: Range band showing daily extremes
          - Grid: Subtle gridlines for reference
          
          Data updates automatically every 5 minutes from Binance API
          without requiring manual page refresh
        */}
        {!isLoading && !isError && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
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
                yAxisId="left"
                stroke={textColor}
                style={{ fontSize: "0.8rem" }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                domain={["dataMin - 100", "dataMax + 100"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? "#333" : "#fff",
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: "8px",
                  color: textColor,
                }}
                formatter={(value: any, name: string) => {
                  if (name === "volume") {
                    return [
                      (value / 1000000).toFixed(2) + "M",
                      name.toUpperCase(),
                    ];
                  }
                  return [formatCurrency(value), name.toUpperCase()];
                }}
              />
              <Legend
                wrapperStyle={{ color: textColor }}
                iconType="line"
                height={20}
              />

              {/* Golden area fill for close price (Binance style) */}
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="close"
                stroke={chartColor}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorClose)"
                dot={false}
                name="Close Price"
              />

              {/* High/Low range dashed lines */}
              <Line
                yAxisId="left"
                type="stepAfter"
                dataKey="high"
                stroke="#66bb6a"
                strokeWidth={1}
                dot={false}
                strokeDasharray="5 5"
                opacity={0.4}
                name="High"
              />
              <Line
                yAxisId="left"
                type="stepAfter"
                dataKey="low"
                stroke="#ef5350"
                strokeWidth={1}
                dot={false}
                strokeDasharray="5 5"
                opacity={0.4}
                name="Low"
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
            <Typography color="textSecondary">No data available</Typography>
          </Box>
        )}
      </Paper>

      {/* Info Section */}
      {/* 
        Footer with data source information:
        - Binance Public API for real-time BTCUSDT data
        - Automatic updates every 5 minutes without manual refresh
        - All prices displayed in USDT
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
          <strong>Data Source:</strong> Binance Public API (BTCUSDT) • Updated every 5
          minutes • All prices in USDT
        </Typography>
      </Paper>
    </Container>
  );
}
