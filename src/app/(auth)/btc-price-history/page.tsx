"use client";

/**
 * BTC Price History Page
 *
 * FEATURES:
 *
 * Statistics Cards (Top Section):
 * - Current Price Card: Shows the live BTC/USDT price from Binance (independent of timeframe)
 *   (always the latest market price, not affected by which timeframe you select)
 * - 24h Change Card: Displays how much the price has changed in the last 24 hours
 *   as both percentage and absolute value. Color-coded: green if up, red if down
 * - High/Low Cards: Show the highest and lowest prices during the selected timeframe
 *   (for the entire timeframe you picked like 1W, 1M, etc., not just 24 hours)
 *
 * Chart (Main Visualization):
 * - Close Price (Golden Line): The main line showing how price moved throughout the period
 * - High/Low (Subtle Range): Dashed lines showing per-candle highs (green) and lows (red)
 *   creating a range band
 * - Volume Bars (Semi-transparent): Gray bars showing trading volume at the bottom
 *
 * Timeframe Selector:
 * - 24H: Last 24 hours with hourly data (24 candles)
 * - 7D: Last 7 days with daily data (7 candles)
 * - 30D: Last 30 days with daily data (30 candles)
 * - 3M: Last 3 months with daily data (90 candles)
 * - 1Y: Last year with daily data (365 candles)
 * - ALL: Extended history with weekly data (1000 candles)
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

const TIMEFRAMES = ["24H", "7D", "30D", "3M", "1Y", "ALL"];

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Format date for chart display
 * Uses UTC timezone (Binance API timezone) for accuracy
 * Timestamps from Binance are in UTC and should not be converted to local time
 */
const formatDate = (timestamp: number, timeframe: string): string => {
  // Create date in UTC (Binance provides UTC timestamps)
  const date = new Date(timestamp);

  switch (timeframe) {
    case "24H":
      // Display as HH:MM UTC for hourly data
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      });
    case "7D":
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
    case "30D":
    case "3M":
    case "1Y":
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
    case "ALL":
      return date.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      });
    default:
      return date.toLocaleDateString("en-US", { timeZone: "UTC" });
  }
};

export default function BtcPriceHistoryPage() {
  const theme = useTheme();
  const [selectedTimeframe, setSelectedTimeframe] = useState("24H");
  const [currentPrice, setCurrentPrice] = useState(0);
  const [change24h, setChange24h] = useState(0);
  const [changePercent24h, setChangePercent24h] = useState(0);
  const { klines, isLoading, isError, error } =
    useBinanceKlines(selectedTimeframe);

  // Fetch live current price and 24h stats from Binance
  React.useEffect(() => {
    const fetchPriceData = async () => {
      try {
        // Fetch live current price (independent of timeframe)
        const tickerResponse = await fetch(
          "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
        );
        const tickerData = await tickerResponse.json();
        const price = parseFloat(tickerData.price);
        if (Number.isFinite(price)) {
          setCurrentPrice(price);
        }

        // Fetch 24h stats (consistent across all timeframes)
        const statsResponse = await fetch(
          "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT",
        );
        const statsData = await statsResponse.json();
        const changeValue = parseFloat(statsData.priceChange);
        const changePercentValue = parseFloat(statsData.priceChangePercent);
        setChange24h(changeValue);
        setChangePercent24h(changePercentValue);
      } catch (err) {
        console.error("Failed to fetch price data:", err);
      }
    };

    fetchPriceData();
    // Refresh every 5 minutes like the klines data
    const interval = setInterval(fetchPriceData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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
        current: currentPrice,
        high: 0,
        low: 0,
        change: change24h,
        changePercent: changePercent24h,
      };
    }

    const high = Math.max(...chartData.map((d) => d.high));
    const low = Math.min(...chartData.map((d) => d.low));

    // Current price comes from live Binance ticker (independent of timeframe)
    // 24h change comes from Binance 24hr stats (consistent across all timeframes)
    // High/Low come from selected timeframe data
    return {
      current: currentPrice,
      high,
      low,
      change: change24h,
      changePercent: changePercent24h,
    };
  }, [chartData, currentPrice, change24h, changePercent24h]);

  const isDark = theme.palette.mode === "dark";
  // Binance-style golden/yellow color for close price
  const chartColor = "#f7b923";
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
          Bitcoin Price History
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Real-time BTC/USDT price data from Binance
        </Typography>
      </Box>

      {/* Statistics Cards Section */}
      {/* 
        These cards show key metrics:
        1. Current Price: Latest live market price from Binance (fixed regardless of timeframe)
        2. 24h Change: Price change in last 24 hours (green/red colored)
        3. High/Low: Range of prices during the entire selected timeframe period
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
            {formatCurrency(statistics.change)} (
            {statistics.changePercent.toFixed(2)}%)
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
        <Box
          sx={{
            mb: 2,
            display: "flex",
            gap: 2,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Typography
            variant="caption"
            color="textSecondary"
            sx={{ fontWeight: 600 }}
          >
            ⏰ All times in UTC
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {TIMEFRAMES.map((timeframe) => (
              <Button
                key={timeframe}
                onClick={() => setSelectedTimeframe(timeframe)}
                variant={
                  selectedTimeframe === timeframe ? "contained" : "outlined"
                }
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
                domain={["dataMin", "dataMax"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? "#333" : "#fff",
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: "8px",
                  color: textColor,
                }}
                formatter={(value, name) => {
                  if (value == null || !name) {
                    return ["", ""];
                  }
                  const numValue =
                    typeof value === "string"
                      ? parseFloat(value)
                      : typeof value === "number"
                        ? value
                        : 0;
                  const nameStr = String(name);
                  if (nameStr === "volume") {
                    return [
                      (numValue / 1000000).toFixed(2) + "M",
                      nameStr.toUpperCase(),
                    ];
                  }
                  return [formatCurrency(numValue), nameStr.toUpperCase()];
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
                type="monotone"
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
                type="monotone"
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
          <strong>Data Source:</strong> Binance Public API (BTCUSDT) • All
          prices in USDT
        </Typography>
      </Paper>
    </Container>
  );
}
