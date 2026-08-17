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
  useMediaQuery,
  CircularProgress,
  Alert,
} from "@mui/material";

interface DailyPerformanceData {
  date: string;
  earnings: number;
  costs: number;
  hashRate: number;
  breakdown?: {
    luxor: number;
    braiins: number;
    luxorRebate: number;
  };
}

interface MiningEarningsChartProps {
  height?: number;
  days?: number;
  viewMode?: "total" | "luxor" | "braiins" | "sideBySide";
  /** "daily" (default) shows `days` days; "monthly" shows every fully-closed month. */
  granularity?: "daily" | "monthly";
}

export default function MiningEarningsChart({
  height = 300,
  days = 10, // Default to 10 days as per Luxor API request
  viewMode = "total",
  granularity = "daily",
}: MiningEarningsChartProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [miningData, setMiningData] = useState<DailyPerformanceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { yMin, yMax } = React.useMemo(() => {
    if (!miningData.length) {
      return { yMin: 0, yMax: 1 };
    }

    let values: number[] = [];

    if (viewMode === "sideBySide") {
      // In side-by-side mode, use both luxor (incl. rebate stack) and braiins values
      values = miningData
        .flatMap((item) => [
          (item.breakdown?.luxor || 0) + (item.breakdown?.luxorRebate || 0),
          item.breakdown?.braiins || 0,
        ])
        .filter((value) => Number.isFinite(value));
    } else if (viewMode === "luxor") {
      // Luxor bar is stacked with its rebate segment on top
      values = miningData
        .map(
          (item) =>
            (item.breakdown?.luxor || 0) + (item.breakdown?.luxorRebate || 0),
        )
        .filter((value) => Number.isFinite(value));
    } else if (viewMode === "braiins") {
      values = miningData
        .map((item) => item.breakdown?.braiins || 0)
        .filter((value) => Number.isFinite(value));
    } else {
      // total mode
      values = miningData
        .map((item) => Number(item.earnings))
        .filter((value) => Number.isFinite(value));
    }

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
  }, [miningData, viewMode]);

  // Fetch mining performance data
  useEffect(() => {
    const fetchMiningData = async () => {
      try {
        setLoading(true);
        setError(null);

        const query =
          granularity === "monthly" ? "granularity=monthly" : `days=${days}`;

        console.log(
          `[MiningEarningsChart] Fetching mining performance data (${query})`,
        );

        const response = await fetch(`/api/mining/daily-performance?${query}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

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
  }, [days, granularity]);

  return (
    <Paper
      sx={{
        p: { xs: 1.5, sm: 3 },
        width: "100%",
        minHeight: height + (isMobile ? 80 : 120),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background:
          theme.palette.mode === "dark"
            ? "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)"
            : "linear-gradient(135deg, rgba(0,198,255,0.02) 0%, rgba(0,114,255,0.02) 100%)",
        backdropFilter: "blur(10px)",
        border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,198,255,0.1)"}`,
        borderRadius: 3,
      }}
    >
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
              margin={{
                top: 20,
                right: isMobile ? 8 : 30,
                left: isMobile ? 10 : 60,
                bottom: 0,
              }}
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
                tick={{
                  fontSize: isMobile ? 9 : 11,
                  fill: theme.palette.text.secondary,
                }}
                tickFormatter={(value: string | number) => {
                  try {
                    const date = new Date(value);
                    return granularity === "monthly"
                      ? date.toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })
                      : date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        });
                  } catch {
                    return String(value);
                  }
                }}
                angle={-45}
                textAnchor="end"
                height={isMobile ? 50 : 80}
              />

              <YAxis
                tick={{
                  fontSize: isMobile ? 8 : 11,
                  fill: theme.palette.text.secondary,
                }}
                domain={[yMin, yMax]}
                tickCount={isMobile ? 6 : 12}
                width={isMobile ? 58 : 80}
                label={
                  isMobile
                    ? undefined
                    : {
                        value: "Revenue (BTC)",
                        angle: -90,
                        position: "left",
                        offset: 24,
                        style: {
                          textAnchor: "middle",
                          fill: theme.palette.text.secondary,
                          fontSize: 12,
                        },
                      }
                }
                tickFormatter={(value) => {
                  if (value === 0) return "0";
                  if (value < 0.00009) {
                    return value.toExponential(1);
                  }
                  return value.toFixed(8);
                }}
              />

              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={({ active, payload, label }: any) => {
                  if (!active || !payload || !payload.length) {
                    return null;
                  }

                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const entries = payload.filter((entry: any) => {
                    if (entry.name === "LuxOS Rebate") {
                      return Number(entry.value) > 0;
                    }
                    return entry.value != null;
                  });

                  if (!entries.length) {
                    return null;
                  }

                  let dateLabel = String(label);
                  try {
                    dateLabel =
                      granularity === "monthly"
                        ? new Date(label).toLocaleDateString("en-US", {
                            month: "long",
                            year: "numeric",
                          })
                        : new Date(label).toLocaleDateString("en-US", {
                            weekday: "short",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          });
                  } catch {
                    // keep raw label
                  }

                  return (
                    <Box
                      sx={{
                        backgroundColor: theme.palette.background.paper,
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: "8px",
                        boxShadow: theme.shadows[4],
                        px: 1.5,
                        py: 1,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, mb: 0.5 }}
                      >
                        {dateLabel}
                      </Typography>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {entries.map((entry: any) => (
                        <Typography
                          key={entry.name}
                          variant="body2"
                          sx={{ color: entry.color }}
                        >
                          {entry.name}: ₿{Number(entry.value).toFixed(8)}
                        </Typography>
                      ))}
                    </Box>
                  );
                }}
                cursor={{ fill: "rgba(0,198,255,0.1)" }}
              />

              <Legend />

              {/* Total earnings view - default. Revenue and LuxOS Rebate
                  are stacked into a single bar per day. */}
              {viewMode === "total" && (
                <>
                  <Bar
                    dataKey={(entry: DailyPerformanceData) =>
                      entry.breakdown
                        ? entry.breakdown.luxor + entry.breakdown.braiins
                        : entry.earnings
                    }
                    name={
                      granularity === "monthly"
                        ? "Monthly Revenue"
                        : "Daily Revenue"
                    }
                    stackId="revenue"
                    barSize={18}
                    radius={[0, 0, 6, 6]}
                    fill="url(#earningsGradient)"
                  />
                  <Bar
                    dataKey="breakdown.luxorRebate"
                    name="LuxOS Rebate"
                    stackId="revenue"
                    barSize={18}
                    radius={[6, 6, 0, 0]}
                    fill={theme.palette.error.main}
                  />
                </>
              )}

              {/* Luxor only view - revenue with rebate stacked on top */}
              {viewMode === "luxor" && (
                <>
                  <Bar
                    dataKey="breakdown.luxor"
                    name="Luxor Revenue"
                    stackId="luxor"
                    barSize={18}
                    radius={[0, 0, 6, 6]}
                    fill="#1565C0"
                  />
                  <Bar
                    dataKey="breakdown.luxorRebate"
                    name="LuxOS Rebate"
                    stackId="luxor"
                    barSize={18}
                    radius={[6, 6, 0, 0]}
                    fill={theme.palette.error.main}
                  />
                </>
              )}

              {/* Braiins only view */}
              {viewMode === "braiins" && (
                <Bar
                  dataKey="breakdown.braiins"
                  name="Braiins Revenue"
                  barSize={18}
                  radius={[6, 6, 0, 0]}
                  fill="#FFA500"
                />
              )}

              {/* Side-by-side view - Luxor (with rebate stacked on top) next to Braiins */}
              {viewMode === "sideBySide" && (
                <>
                  <Bar
                    dataKey="breakdown.luxor"
                    name="Luxor"
                    stackId="luxor"
                    radius={[0, 0, 6, 6]}
                    fill="#1565C0"
                  />
                  <Bar
                    dataKey="breakdown.luxorRebate"
                    name="LuxOS Rebate"
                    stackId="luxor"
                    radius={[6, 6, 0, 0]}
                    fill={theme.palette.error.main}
                  />
                  <Bar
                    dataKey="breakdown.braiins"
                    name="Braiins"
                    radius={[6, 6, 0, 0]}
                    fill="#FFA500"
                  />
                </>
              )}
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
