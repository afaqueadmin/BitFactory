"use client";

/**
 * BTC Price History Page - BitFactory Daylight theme (v1.3)
 *
 * FEATURES:
 *
 * Statistics Cards (Top Section):
 * - Current Price Card: Shows the live BTC/USDT price from Binance (independent of timeframe)
 *   (always the latest market price, not affected by which timeframe you select)
 * - 24h Change Card: Displays how much the price has changed in the last 24 hours
 *   as both percentage and absolute value. Colour-coded via a mint/danger StatCard tone.
 * - High/Low Cards: Show the highest and lowest prices during the selected timeframe
 *   (for the entire timeframe you picked like 1W, 1M, etc., not just 24 hours)
 *
 * Chart (Main Visualization):
 * - Close Price (Golden Line): The main line showing how price moved throughout the period -
 *   deliberately kept Binance's own gold, not restyled to a Daylight brand colour, along with
 *   its green/red high-low range lines, since the point is to read like Binance's own chart.
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
  Typography,
  CircularProgress,
  Alert,
  useMediaQuery,
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
import CurrencyBitcoinOutlinedIcon from "@mui/icons-material/CurrencyBitcoinOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";
import SwapVertOutlinedIcon from "@mui/icons-material/SwapVertOutlined";
import { useBinanceKlines, KlineData } from "@/hooks/useBinanceKlines";
import { fetchLiveBtc24hStats } from "@/lib/services/btcPriceService";
import StatCard from "@/components/daylight/StatCard";
import PillTab from "@/components/daylight/PillTab";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

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
  const { d, fonts } = useDaylight();
  const [selectedTimeframe, setSelectedTimeframe] = useState("24H");
  const [currentPrice, setCurrentPrice] = useState(0);
  const [change24h, setChange24h] = useState(0);
  const [changePercent24h, setChangePercent24h] = useState(0);
  const { klines, isLoading, isError, error } =
    useBinanceKlines(selectedTimeframe);

  // Fetch live current price and 24h stats with resilient multi-provider fallback
  React.useEffect(() => {
    const fetchPriceData = async () => {
      try {
        const stats = await fetchLiveBtc24hStats();
        if (Number.isFinite(stats.price) && stats.price > 0) {
          setCurrentPrice(stats.price);
        }
        setChange24h(stats.priceChange);
        setChangePercent24h(stats.priceChangePercent);
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

    const high = Math.max(...chartData.map((point) => point.high));
    const low = Math.min(...chartData.map((point) => point.low));

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

  const isMobile = useMediaQuery("(max-width:599.95px)");
  const isUp = statistics.change >= 0;
  // Binance-style golden/yellow color for close price - kept as-is (see file header).
  const chartColor = "#f7b923";

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
          Bitcoin Price History
        </Typography>
        <Typography
          sx={{
            fontSize: { xs: 12, md: 13 },
            lineHeight: { xs: 1.7, md: 1.5 },
            color: d.muted,
            mt: "7px",
          }}
        >
          Real-time BTC/USDT price data from Binance.
        </Typography>
      </Box>

      {/* KPI cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: { xs: "10px", sm: "16px" },
          mb: { xs: "18px", sm: "22px" },
          "@media (max-width:699.95px)": { gridTemplateColumns: "1fr 1fr" },
        }}
      >
        <StatCard
          title="Current Price"
          value={formatCurrency(statistics.current)}
          caption="Live BTC/USDT"
          tone="sky"
          icon={<CurrencyBitcoinOutlinedIcon />}
          isLoading={!statistics.current}
        />
        <StatCard
          title="24h Change"
          value={`${isUp ? "+" : ""}${formatCurrency(statistics.change)}`}
          caption={`${isUp ? "+" : ""}${statistics.changePercent.toFixed(2)}%`}
          tone={isUp ? "mint" : "danger"}
          valueColor={isUp ? d.success : d.danger}
          icon={
            isUp ? <TrendingUpOutlinedIcon /> : <TrendingDownOutlinedIcon />
          }
          isLoading={!statistics.current}
        />
        <StatCard
          title={`High / Low (${selectedTimeframe})`}
          value={formatCurrency(statistics.high)}
          caption={`Low ${formatCurrency(statistics.low)}`}
          tone="amber"
          icon={<SwapVertOutlinedIcon />}
          isLoading={isLoading && chartData.length === 0}
        />
      </Box>

      {/* Chart card */}
      <Box
        sx={{
          bgcolor: d.surface,
          border: `1px solid ${d.border}`,
          borderRadius: RADIUS_CARD,
          boxShadow: d.shadow,
          p: { xs: "16px 12px", sm: "20px 24px" },
          mb: { xs: "18px", sm: "22px" },
        }}
      >
        {/* Timeframe selector */}
        <Box
          sx={{
            mb: "16px",
            display: "flex",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 650,
              color: d.muted,
              display: { xs: "none", sm: "block" },
              whiteSpace: "nowrap",
            }}
          >
            All times in UTC
          </Typography>
          <Box
            sx={{
              display: "flex",
              gap: "4px",
              flexWrap: "wrap",
              overflowX: "auto",
              pb: { xs: "2px", sm: 0 },
              "&::-webkit-scrollbar": { display: "none" },
            }}
          >
            {TIMEFRAMES.map((timeframe) => (
              <PillTab
                key={timeframe}
                active={selectedTimeframe === timeframe}
                onClick={() => setSelectedTimeframe(timeframe)}
              >
                {timeframe}
              </PillTab>
            ))}
          </Box>
        </Box>

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
            }}
          >
            <Typography
              sx={{ fontWeight: 700, fontSize: 13, fontFamily: fonts.body }}
            >
              Failed to load price data
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
        {!isLoading && !isError && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={isMobile ? 260 : 400}>
            <AreaChart
              data={chartData}
              margin={{ left: isMobile ? 0 : 10, right: isMobile ? 4 : 10 }}
            >
              <defs>
                <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
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
                yAxisId="left"
                stroke={d.border}
                tick={{
                  fontSize: isMobile ? 9 : 12,
                  fill: d.muted,
                  fontFamily: fonts.body,
                }}
                width={isMobile ? 52 : 70}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                domain={["dataMin", "dataMax"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: d.surface,
                  border: `1px solid ${d.border}`,
                  borderRadius: "10px",
                  boxShadow: "0 8px 30px rgba(100,114,124,.13)",
                  color: d.text,
                  fontFamily: fonts.body,
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
                wrapperStyle={{
                  color: d.muted,
                  fontFamily: fonts.body,
                  fontSize: 12,
                }}
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

        {/* Empty state */}
        {!isLoading && !isError && chartData.length === 0 && (
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
              No data available
            </Typography>
          </Box>
        )}
      </Box>

      {/* Info footer */}
      <Box
        sx={{
          p: { xs: "14px 16px", sm: "16px 20px" },
          borderRadius: RADIUS_CARD,
          bgcolor: d.skySoft,
          border: `1px solid ${d.borderSky}`,
        }}
      >
        <Typography sx={{ fontSize: 12, color: d.text }}>
          <Box component="strong" sx={{ fontWeight: 700 }}>
            Data Source:
          </Box>{" "}
          Binance Public API (BTCUSDT) • All prices in USDT
        </Typography>
      </Box>
    </Box>
  );
}
