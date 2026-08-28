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
  Stack,
} from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";

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
  height = 340,
  days = 10,
  viewMode = "total",
  granularity = "daily",
}: MiningEarningsChartProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.down("md"));
  const [miningData, setMiningData] = useState<DailyPerformanceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calculate summary metrics for the active data
  const summaryMetrics = React.useMemo(() => {
    if (!miningData.length) {
      return { total: 0, avg: 0, count: 0 };
    }

    let total = 0;
    if (viewMode === "luxor") {
      total = miningData.reduce(
        (sum, item) =>
          sum +
          (item.breakdown?.luxor || 0) +
          (item.breakdown?.luxorRebate || 0),
        0,
      );
    } else if (viewMode === "braiins") {
      total = miningData.reduce(
        (sum, item) => sum + (item.breakdown?.braiins || 0),
        0,
      );
    } else {
      total = miningData.reduce(
        (sum, item) =>
          sum +
          (item.breakdown
            ? item.breakdown.luxor +
              item.breakdown.braiins +
              item.breakdown.luxorRebate
            : item.earnings),
        0,
      );
    }

    const avg = total / miningData.length;
    return {
      total,
      avg,
      count: miningData.length,
    };
  }, [miningData, viewMode]);

  const { yMin, yMax } = React.useMemo(() => {
    if (!miningData.length) {
      return { yMin: 0, yMax: 1 };
    }

    let values: number[] = [];

    if (viewMode === "sideBySide") {
      values = miningData
        .flatMap((item) => [
          (item.breakdown?.luxor || 0) + (item.breakdown?.luxorRebate || 0),
          item.breakdown?.braiins || 0,
        ])
        .filter((value) => Number.isFinite(value));
    } else if (viewMode === "luxor") {
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
      values = miningData
        .map((item) =>
          Number(
            item.breakdown
              ? item.breakdown.luxor +
                  item.breakdown.braiins +
                  item.breakdown.luxorRebate
              : item.earnings,
          ),
        )
        .filter((value) => Number.isFinite(value));
    }

    if (!values.length) {
      return { yMin: 0, yMax: 1 };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || Math.max(max * 0.05, 0.00000001);
    const padding = range * 0.4;

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

        const response = await fetch(`/api/mining/daily-performance?${query}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error ||
              `Failed to fetch mining data: ${response.statusText}`,
          );
        }

        const data = await response.json();

        if (data.success && Array.isArray(data.data)) {
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

  // Dynamic X-axis interval to prevent tick collisions on mobile
  const xAxisInterval = React.useMemo(() => {
    if (!isMobile) return 0;
    if (granularity === "monthly") return 0;
    const len = miningData.length;
    if (len <= 7) return 0;
    if (len <= 15) return 1;
    if (len <= 22) return 2;
    return Math.floor(len / 6); // Display around 5-6 points on mobile
  }, [isMobile, granularity, miningData.length]);

  const maxBarWidth = isMobile
    ? viewMode === "sideBySide"
      ? 8
      : 12
    : isTablet
      ? 16
      : 22;

  const chartHeight = isMobile ? Math.max(260, height - 60) : height;

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 2.5, md: 3 },
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background:
          theme.palette.mode === "dark"
            ? "linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)"
            : "linear-gradient(145deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 249, 255, 0.9) 100%)",
        backdropFilter: "blur(12px)",
        border: `1px solid ${
          theme.palette.mode === "dark"
            ? "rgba(255, 255, 255, 0.08)"
            : "rgba(0, 198, 255, 0.15)"
        }`,
        borderRadius: { xs: 2.5, md: 3 },
        boxShadow:
          theme.palette.mode === "dark"
            ? "0 8px 32px rgba(0, 0, 0, 0.3)"
            : "0 8px 24px rgba(0, 114, 255, 0.06)",
        overflow: "hidden",
      }}
    >
      {/* Quick Summary KPIs on mobile & desktop */}
      {!loading && !error && miningData.length > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" },
            gap: { xs: 1, sm: 1.5 },
            mb: { xs: 2, sm: 2.5 },
            p: { xs: 1.25, sm: 1.5 },
            borderRadius: 2,
            backgroundColor:
              theme.palette.mode === "dark"
                ? "rgba(255, 255, 255, 0.03)"
                : "rgba(0, 0, 0, 0.02)",
            border: `1px solid ${
              theme.palette.mode === "dark"
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(0, 0, 0, 0.04)"
            }`,
          }}
        >
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontSize: { xs: "0.7rem", sm: "0.75rem" },
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <TrendingUpIcon sx={{ fontSize: 14, color: "primary.main" }} />
              Period Total
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                fontSize: { xs: "0.85rem", sm: "1rem" },
                color: theme.palette.text.primary,
                mt: 0.25,
              }}
            >
              ₿{summaryMetrics.total.toFixed(8)}
            </Typography>
          </Box>

          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontSize: { xs: "0.7rem", sm: "0.75rem" },
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <CalendarTodayIcon sx={{ fontSize: 13, color: "success.main" }} />
              {granularity === "monthly" ? "Monthly Avg" : "Daily Avg"}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                fontSize: { xs: "0.85rem", sm: "1rem" },
                color: theme.palette.text.primary,
                mt: 0.25,
              }}
            >
              ₿{summaryMetrics.avg.toFixed(8)}
            </Typography>
          </Box>

          <Box
            sx={{
              display: { xs: "none", sm: "block" },
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: "0.75rem", fontWeight: 500 }}
            >
              Data Points
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                fontSize: "1rem",
                color: theme.palette.text.primary,
                mt: 0.25,
              }}
            >
              {summaryMetrics.count}{" "}
              {granularity === "monthly" ? "Months" : "Days"}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Loading State */}
      {loading && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            height: chartHeight,
            gap: 1.5,
          }}
        >
          <CircularProgress size={36} thickness={4} />
          <Typography variant="caption" color="text.secondary">
            Loading mining performance...
          </Typography>
        </Box>
      )}

      {/* Error State */}
      {error && !loading && (
        <Box sx={{ py: 3, width: "100%" }}>
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            {error}
          </Alert>
        </Box>
      )}

      {/* No Data State */}
      {!loading && !error && miningData.length === 0 && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            height: chartHeight,
            gap: 1,
          }}
        >
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            No mining performance records available for this period.
          </Typography>
        </Box>
      )}

      {/* Chart */}
      {!loading && !error && miningData.length > 0 && (
        <Box
          sx={{
            width: "100%",
            height: chartHeight,
            touchAction: "pan-y", // Allow smooth vertical scroll on mobile while touching chart
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={miningData}
              barCategoryGap={isMobile ? "15%" : "22%"}
              margin={{
                top: 10,
                right: isMobile ? 4 : 20,
                left: isMobile ? -14 : 20,
                bottom: isMobile ? 10 : 20,
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
                  <stop offset="0%" stopColor="#00C6FF" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#0072FF" stopOpacity={0.4} />
                </linearGradient>
                <linearGradient id="luxorGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1E88E5" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#1565C0" stopOpacity={0.4} />
                </linearGradient>
                <linearGradient
                  id="braiinsGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#FFB300" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#FB8C00" stopOpacity={0.4} />
                </linearGradient>
                <linearGradient id="rebateGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF5252" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#D32F2F" stopOpacity={0.4} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={
                  theme.palette.mode === "dark"
                    ? "rgba(255, 255, 255, 0.07)"
                    : "rgba(0, 0, 0, 0.05)"
                }
              />

              <XAxis
                dataKey="date"
                interval={xAxisInterval}
                tick={{
                  fontSize: isMobile ? 10 : 11,
                  fill: theme.palette.text.secondary,
                }}
                tickFormatter={(value: string | number) => {
                  try {
                    const date = new Date(value);
                    if (granularity === "monthly") {
                      return isMobile
                        ? date.toLocaleDateString("en-US", {
                            month: "short",
                            year: "2-digit",
                          })
                        : date.toLocaleDateString("en-US", {
                            month: "short",
                            year: "numeric",
                          });
                    }
                    return isMobile
                      ? date.toLocaleDateString("en-US", {
                          month: "numeric",
                          day: "numeric",
                        })
                      : date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        });
                  } catch {
                    return String(value);
                  }
                }}
                angle={isMobile ? -25 : -35}
                textAnchor="end"
                height={isMobile ? 40 : 50}
                tickLine={false}
                axisLine={{
                  stroke:
                    theme.palette.mode === "dark"
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(0,0,0,0.1)",
                }}
              />

              <YAxis
                tick={{
                  fontSize: isMobile ? 9 : 11,
                  fill: theme.palette.text.secondary,
                }}
                domain={[yMin, yMax]}
                tickCount={isMobile ? 5 : 8}
                width={isMobile ? 52 : 72}
                tickLine={false}
                axisLine={false}
                label={
                  isMobile
                    ? undefined
                    : {
                        value: "Revenue (BTC)",
                        angle: -90,
                        position: "insideLeft",
                        offset: 10,
                        style: {
                          textAnchor: "middle",
                          fill: theme.palette.text.secondary,
                          fontSize: 12,
                          fontWeight: 500,
                        },
                      }
                }
                tickFormatter={(value) => {
                  if (value === 0) return "0";
                  if (value < 0.00001) return value.toExponential(1);
                  if (isMobile) {
                    // Cleaner compact format on mobile
                    return value.toFixed(5);
                  }
                  return value.toFixed(7);
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
                    return entry.value != null && Number(entry.value) > 0;
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

                  const totalInTooltip = entries.reduce(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (acc: number, curr: any) => acc + Number(curr.value || 0),
                    0,
                  );

                  return (
                    <Box
                      sx={{
                        backgroundColor:
                          theme.palette.mode === "dark"
                            ? "rgba(15, 23, 42, 0.95)"
                            : "rgba(255, 255, 255, 0.98)",
                        backdropFilter: "blur(12px)",
                        border: `1px solid ${
                          theme.palette.mode === "dark"
                            ? "rgba(255, 255, 255, 0.15)"
                            : "rgba(0, 0, 0, 0.1)"
                        }`,
                        borderRadius: "10px",
                        boxShadow:
                          theme.palette.mode === "dark"
                            ? "0 8px 32px rgba(0,0,0,0.6)"
                            : "0 8px 24px rgba(0,0,0,0.12)",
                        px: 1.75,
                        py: 1.25,
                        minWidth: 150,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: "text.primary",
                          display: "block",
                          borderBottom: `1px solid ${theme.palette.divider}`,
                          pb: 0.5,
                          mb: 0.75,
                        }}
                      >
                        {dateLabel}
                      </Typography>

                      <Stack spacing={0.5}>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {entries.map((entry: any) => (
                          <Box
                            key={entry.name}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 1.5,
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.75,
                              }}
                            >
                              <Box
                                sx={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  backgroundColor: entry.color || "#00C6FF",
                                }}
                              />
                              <Typography
                                variant="caption"
                                sx={{
                                  color: "text.secondary",
                                  fontWeight: 500,
                                }}
                              >
                                {entry.name}
                              </Typography>
                            </Box>
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 700,
                                color: "text.primary",
                                fontFamily: "monospace",
                              }}
                            >
                              ₿{Number(entry.value).toFixed(8)}
                            </Typography>
                          </Box>
                        ))}

                        {entries.length > 1 && (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              borderTop: `1px dashed ${theme.palette.divider}`,
                              pt: 0.5,
                              mt: 0.5,
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: 700, color: "text.primary" }}
                            >
                              Total
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 800,
                                color: "primary.main",
                                fontFamily: "monospace",
                              }}
                            >
                              ₿{totalInTooltip.toFixed(8)}
                            </Typography>
                          </Box>
                        )}
                      </Stack>
                    </Box>
                  );
                }}
                cursor={{
                  fill:
                    theme.palette.mode === "dark"
                      ? "rgba(255, 255, 255, 0.05)"
                      : "rgba(0, 198, 255, 0.08)",
                }}
              />

              <Legend
                wrapperStyle={{
                  fontSize: isMobile ? "0.75rem" : "0.85rem",
                  paddingTop: isMobile ? "4px" : "12px",
                }}
              />

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
                    maxBarSize={maxBarWidth}
                    radius={[0, 0, 4, 4]}
                    fill="url(#earningsGradient)"
                  />
                  <Bar
                    dataKey="breakdown.luxorRebate"
                    name="LuxOS Rebate"
                    stackId="revenue"
                    maxBarSize={maxBarWidth}
                    radius={[4, 4, 0, 0]}
                    fill="url(#rebateGradient)"
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
                    maxBarSize={maxBarWidth}
                    radius={[0, 0, 4, 4]}
                    fill="url(#luxorGradient)"
                  />
                  <Bar
                    dataKey="breakdown.luxorRebate"
                    name="LuxOS Rebate"
                    stackId="luxor"
                    maxBarSize={maxBarWidth}
                    radius={[4, 4, 0, 0]}
                    fill="url(#rebateGradient)"
                  />
                </>
              )}

              {/* Braiins only view */}
              {viewMode === "braiins" && (
                <Bar
                  dataKey="breakdown.braiins"
                  name="Braiins Revenue"
                  maxBarSize={maxBarWidth}
                  radius={[4, 4, 0, 0]}
                  fill="url(#braiinsGradient)"
                />
              )}

              {/* Side-by-side view - Luxor (with rebate stacked on top) next to Braiins */}
              {viewMode === "sideBySide" && (
                <>
                  <Bar
                    dataKey="breakdown.luxor"
                    name="Luxor"
                    stackId="luxor"
                    maxBarSize={maxBarWidth}
                    radius={[0, 0, 4, 4]}
                    fill="url(#luxorGradient)"
                  />
                  <Bar
                    dataKey="breakdown.luxorRebate"
                    name="LuxOS Rebate"
                    stackId="luxor"
                    maxBarSize={maxBarWidth}
                    radius={[4, 4, 0, 0]}
                    fill="url(#rebateGradient)"
                  />
                  <Bar
                    dataKey="breakdown.braiins"
                    name="Braiins"
                    maxBarSize={maxBarWidth}
                    radius={[4, 4, 0, 0]}
                    fill="url(#braiinsGradient)"
                  />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  );
}
