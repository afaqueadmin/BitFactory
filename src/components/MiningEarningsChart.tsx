// src/components/MiningEarningsChart.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Paper,
  Typography,
  Box,
  useTheme,
  CircularProgress,
  Alert,
} from "@mui/material";

interface DailyPerformanceData {
  date: string;
  earnings: number;
  costs: number;
  hashRate: number;
}

interface MiningEarningsChartProps {
  title?: string;
  height?: number;
  days?: number;
}

export default function MiningEarningsChart({
  title = "Mining Performance",
  height = 300,
  days = 10, // Default to 10 days as per Luxor API request
}: MiningEarningsChartProps) {
  const theme = useTheme();
  const [miningData, setMiningData] = useState<DailyPerformanceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { yMin, yMax } = React.useMemo(() => {
    if (!miningData.length) {
      return { yMin: 0, yMax: 1 };
    }

    const values = miningData
      .map((item) => Number(item.earnings))
      .filter((value) => Number.isFinite(value));

    if (!values.length) {
      return { yMin: 0, yMax: 1 };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || Math.max(max * 0.05, 0.00000001);
    const padding = range * 0.7;

    return {
      yMin: Math.max(0, min - padding),
      yMax: max + padding,
    };
  }, [miningData]);

  // Fetch mining performance data
  useEffect(() => {
    const fetchMiningData = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log(
          `[MiningEarningsChart] Fetching ${days} days of mining performance data`,
        );

        const response = await fetch(
          `/api/mining/daily-performance?days=${days}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        console.log(
          `[MiningEarningsChart] API Response Status: ${response.status} ${response.statusText}`,
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error(`[MiningEarningsChart] API Error Response:`, errorData);
          throw new Error(
            errorData.error ||
              `Failed to fetch mining data: ${response.statusText}`,
          );
        }

        const data = await response.json();
        console.log(`[MiningEarningsChart] Raw API Response:`, data);

        if (data.success && Array.isArray(data.data)) {
          console.log(
            `[MiningEarningsChart] Fetched ${data.data.length} days of performance data`,
          );
          console.log("[MiningEarningsChart] Summary:", data.summary);
          setMiningData(data.data);
        } else {
          throw new Error(data.error || "Failed to fetch mining data");
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to fetch mining data";
        console.error("[MiningEarningsChart] Error:", errorMsg);
        setError(errorMsg);
        setMiningData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMiningData();
  }, [days]);

  return (
    <Paper
      sx={{
        p: 3,
        width: "100%",
        minHeight: height + 120,
        display: "flex",
        flexDirection: "column",
        background:
          theme.palette.mode === "dark"
            ? "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)"
            : "linear-gradient(135deg, rgba(0,198,255,0.02) 0%, rgba(0,114,255,0.02) 100%)",
        backdropFilter: "blur(10px)",
        border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,198,255,0.1)"}`,
      }}
    >
      <Typography
        variant="h6"
        gutterBottom
        sx={{
          background: "linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontWeight: 600,
          mb: 2,
        }}
      >
        {title}
      </Typography>

      {/* Loading State */}
      {loading && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height,
          }}
        >
          <CircularProgress />
        </Box>
      )}

      {/* Error State */}
      {error && !loading && (
        <Box sx={{ height }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      {/* No Data State */}
      {!loading && !error && miningData.length === 0 && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height,
          }}
        >
          <Typography color="text.secondary">
            No mining data available yet
          </Typography>
        </Box>
      )}

      {/* Chart */}
      {!loading && !error && miningData.length > 0 && (
        <Box sx={{ flex: 1, width: "100%", height }}>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart
              data={miningData}
              margin={{ top: 20, right: 30, left: 60, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="earningsGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#00C6FF" stopOpacity={0.9} />
                  <stop offset="95%" stopColor="#00C6FF" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id="costsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF6B6B" stopOpacity={0.9} />
                  <stop offset="95%" stopColor="#FF6B6B" stopOpacity={0.3} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke={theme.palette.mode === "dark" ? "#333" : "#f0f0f0"}
              />

              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                tickFormatter={(value: string | number) => {
                  try {
                    const date = new Date(value);
                    return date.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });
                  } catch {
                    return String(value);
                  }
                }}
                angle={-45}
                textAnchor="end"
                height={80}
              />

              <YAxis
                tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                domain={[yMin, yMax]}
                tickCount={12}
                label={{
                  value: "Revenue (BTC ₿)",
                  angle: -90,
                  position: "left",
                  offset: 24,
                  style: {
                    textAnchor: "middle",
                    fill: theme.palette.text.secondary,
                    fontSize: 12,
                  },
                }}
                tickFormatter={(value) => {
                  if (value === 0) return "0";
                  if (value < 0.00009) {
                    return value.toExponential(1);
                  }
                  return value.toFixed(8);
                }}
              />

              <Tooltip
                formatter={(value: number | string, name: string) => {
                  const num = Number(value);
                  if (name === "earnings" || name === "Daily Revenue (Luxor)") {
                    const btcValue = num.toFixed(8);
                    return [`₿${btcValue}`, "Daily Revenue"];
                  }
                  return [
                    `${num.toFixed(8)}`,
                    name === "costs" ? "Costs" : name,
                  ];
                }}
                labelFormatter={(value) => {
                  try {
                    const date = new Date(value);
                    return date.toLocaleDateString("en-US", {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    });
                  } catch {
                    return String(value);
                  }
                }}
                contentStyle={{
                  backgroundColor: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: "8px",
                  boxShadow: theme.shadows[4],
                }}
                cursor={{ fill: "rgba(0,198,255,0.1)" }}
              />

              <Legend />

              <Bar
                dataKey="earnings"
                name="Daily Revenue (Luxor)"
                barSize={18}
                radius={[6, 6, 0, 0]}
                fill="url(#earningsGradient)"
              />
              {/* <Bar
                dataKey="costs"
                name="Costs"
                barSize={18}
                radius={[6, 6, 0, 0]}
                fill="url(#costsGradient)"
              /> */}
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  );
}
