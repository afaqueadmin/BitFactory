"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
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
  Alert,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
  useTheme,
  useMediaQuery,
  Chip,
} from "@mui/material";
import { formatValue } from "@/lib/helpers/formatValue";
import { MinerModel, MINER_LABELS } from "@/lib/helpers/paybackCalculations";
import {
  usePaybackHistory,
  PaybackHistoryProfile,
} from "@/hooks/usePaybackHistory";
import {
  PAYBACK_HISTORY_RANGES,
  PaybackHistoryRange,
} from "@/lib/helpers/paybackHistoryRange";
import { mapSnapshotsToChartSeries } from "@/lib/helpers/paybackChartMapping";
import {
  buildPaybackChartHeading,
  PaybackOsFilter,
} from "@/lib/helpers/paybackChartHeading";

const RANGE_LABELS: Record<PaybackHistoryRange, string> = {
  "30D": "30D",
  "90D": "90D",
  "1Y": "1Y",
  ALL: "All",
};

const COLOR_STOCK_OS = "#1976D2"; // blue
const COLOR_CUSTOM_OS = "#2E7D32"; // green
const COLOR_BTC_PRICE = "#F59E0B"; // amber / gold

const BASE_TITLE = "Buy BTC vs Mine BTC";

interface PaybackHistoryChartProps {
  profile: PaybackHistoryProfile;
  miner: MinerModel;
  os: PaybackOsFilter;
  height?: number;
}

interface TooltipEntry {
  name: string;
  value: number;
  color: string;
  dataKey?: string;
}

export default function PaybackHistoryChart({
  profile,
  miner,
  os,
  height = 320,
}: PaybackHistoryChartProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [range, setRange] = useState<PaybackHistoryRange>("30D");

  const heading = useMemo(
    () => buildPaybackChartHeading(BASE_TITLE, MINER_LABELS[miner], os),
    [miner, os],
  );

  const { historyData, isLoading, isError, error } = usePaybackHistory(
    profile,
    miner,
    range,
  );

  const chartData = useMemo(
    () => mapSnapshotsToChartSeries(historyData),
    [historyData],
  );

  const { yMin, yMax } = useMemo(() => {
    if (chartData.length === 0) return { yMin: 0, yMax: 1 };

    const values = chartData.flatMap((point) => {
      const list = [point.btcPriceUsd];
      if (os === "STOCK") list.push(point.stockOsBreakeven);
      if (os === "CUSTOM") list.push(point.customOsBreakeven);
      return list;
    });

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || Math.max(max * 0.1, 1);
    const padding = span * 0.12;

    return {
      yMin: Math.max(0, Math.floor((min - padding) / 1000) * 1000),
      yMax: Math.ceil((max + padding) / 1000) * 1000,
    };
  }, [chartData, os]);

  return (
    <Paper
      sx={{
        p: { xs: 2, sm: 3 },
        width: "100%",
        mb: 3,
        borderRadius: 3,
        border: "1px solid",
        borderColor: (theme) => theme.palette.divider,
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "center" },
          gap: 1.5,
          mb: 2.5,
        }}
      >
        <Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              fontSize: { xs: "1.05rem", sm: "1.25rem" },
            }}
          >
            {heading}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", display: "block", mt: 0.25 }}
          >
            Comparing Breakeven Production Cost vs. Live BTC Spot Price
          </Typography>
        </Box>

        <ToggleButtonGroup
          value={range}
          exclusive
          size="small"
          onChange={(_event, value: PaybackHistoryRange | null) => {
            if (value) setRange(value);
          }}
          aria-label="History range"
          sx={{
            alignSelf: { xs: "flex-start", sm: "center" },
            "& .MuiToggleButton-root": {
              px: { xs: 1.25, sm: 1.75 },
              py: 0.4,
              fontSize: "0.75rem",
              fontWeight: 600,
              borderRadius: "6px !important",
              mx: 0.25,
              border: "1px solid transparent",
              "&.Mui-selected": {
                bgcolor: "primary.main",
                color: "#fff",
                "&:hover": {
                  bgcolor: "primary.dark",
                },
              },
            },
          }}
        >
          {PAYBACK_HISTORY_RANGES.map((r) => (
            <ToggleButton key={r} value={r} aria-label={RANGE_LABELS[r]}>
              {RANGE_LABELS[r]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {isLoading && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height,
          }}
        >
          <CircularProgress size={36} />
        </Box>
      )}

      {!isLoading && isError && (
        <Box sx={{ height, display: "flex", alignItems: "center" }}>
          <Alert severity="error" sx={{ width: "100%" }}>
            {error || "Failed to load historical payback data"}
          </Alert>
        </Box>
      )}

      {!isLoading && !isError && chartData.length === 0 && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height,
          }}
        >
          <Alert severity="info" sx={{ width: "100%" }}>
            No historical data yet. Daily snapshots will appear here once
            collected.
          </Alert>
        </Box>
      )}

      {!isLoading && !isError && chartData.length > 0 && (
        <Box sx={{ width: "100%", height }}>
          <ResponsiveContainer width="100%" height={height}>
            <LineChart
              data={chartData}
              margin={{
                top: 12,
                right: isMobile ? 8 : 20,
                left: isMobile ? -10 : 10,
                bottom: 4,
              }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke={
                  theme.palette.mode === "dark"
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.06)"
                }
              />
              <XAxis
                dataKey="dateLabel"
                axisLine={false}
                tickLine={false}
                tick={{
                  fontSize: isMobile ? 10 : 11,
                  fill: theme.palette.text.secondary,
                }}
                interval={isMobile ? "preserveStartEnd" : "preserveStartEnd"}
                minTickGap={24}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{
                  fontSize: isMobile ? 10 : 11,
                  fill: theme.palette.text.secondary,
                }}
                width={isMobile ? 54 : 64}
                domain={[yMin, yMax]}
                tickCount={isMobile ? 5 : 6}
                tickFormatter={(value: number) =>
                  `$${Math.round(value / 1000)}k`
                }
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;

                  const entries = payload as unknown as TooltipEntry[];
                  const btcEntry = entries.find(
                    (e) =>
                      e.dataKey === "btcPriceUsd" ||
                      e.name.toLowerCase().includes("btc"),
                  );
                  const breakevenEntry = entries.find(
                    (e) =>
                      e.dataKey === "stockOsBreakeven" ||
                      e.dataKey === "customOsBreakeven" ||
                      e.name.toLowerCase().includes("breakeven"),
                  );

                  let spreadText = null;
                  let isMiningProfitable = false;
                  if (btcEntry && breakevenEntry) {
                    const diff = btcEntry.value - breakevenEntry.value;
                    const pct =
                      breakevenEntry.value > 0
                        ? (diff / breakevenEntry.value) * 100
                        : 0;
                    isMiningProfitable = diff >= 0;
                    spreadText = `${diff >= 0 ? "+" : ""}${formatValue(diff, "currency")} (${diff >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
                  }

                  return (
                    <Box
                      sx={{
                        backgroundColor:
                          theme.palette.mode === "dark"
                            ? "rgba(30, 30, 35, 0.95)"
                            : "rgba(255, 255, 255, 0.96)",
                        backdropFilter: "blur(8px)",
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: "10px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                        p: 1.5,
                        minWidth: 190,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: "text.secondary",
                          display: "block",
                          mb: 0.75,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        {label}
                      </Typography>

                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 0.5,
                        }}
                      >
                        {entries.map((entry) => (
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
                                  backgroundColor: entry.color,
                                }}
                              />
                              <Typography
                                variant="body2"
                                sx={{
                                  color: "text.primary",
                                  fontSize: "0.82rem",
                                  fontWeight: 500,
                                }}
                              >
                                {entry.name}
                              </Typography>
                            </Box>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 700,
                                color: entry.color,
                                fontSize: "0.85rem",
                              }}
                            >
                              {formatValue(entry.value, "currency")}
                            </Typography>
                          </Box>
                        ))}
                      </Box>

                      {spreadText && (
                        <Box
                          sx={{
                            mt: 1,
                            pt: 0.75,
                            borderTop: `1px solid ${theme.palette.divider}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 1,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              color: "text.secondary",
                              fontWeight: 600,
                            }}
                          >
                            Mining Advantage:
                          </Typography>
                          <Chip
                            label={
                              isMiningProfitable
                                ? `Mine +${spreadText.split(" ")[1] || ""}`
                                : `Buy BTC`
                            }
                            size="small"
                            color={isMiningProfitable ? "success" : "warning"}
                            sx={{
                              height: 20,
                              fontSize: "0.7rem",
                              fontWeight: 700,
                            }}
                          />
                        </Box>
                      )}
                    </Box>
                  );
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{
                  paddingBottom: 14,
                  fontSize: isMobile ? 11 : 12.5,
                  fontWeight: 600,
                }}
              />

              {/* Stock OS Breakeven Line (Shown when OS is STOCK) */}
              {os === "STOCK" && (
                <Line
                  type="monotone"
                  dataKey="stockOsBreakeven"
                  name="Stock OS Breakeven"
                  stroke={COLOR_STOCK_OS}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{
                    r: 6,
                    stroke: "#FFFFFF",
                    strokeWidth: 2,
                    fill: COLOR_STOCK_OS,
                  }}
                />
              )}

              {/* Custom OS Breakeven Line (Shown when OS is CUSTOM) */}
              {os === "CUSTOM" && (
                <Line
                  type="monotone"
                  dataKey="customOsBreakeven"
                  name="Custom OS Breakeven"
                  stroke={COLOR_CUSTOM_OS}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{
                    r: 6,
                    stroke: "#FFFFFF",
                    strokeWidth: 2,
                    fill: COLOR_CUSTOM_OS,
                  }}
                />
              )}

              {/* BTC Market Price Reference Line */}
              <Line
                type="monotone"
                dataKey="btcPriceUsd"
                name="BTC Market Price"
                stroke={COLOR_BTC_PRICE}
                strokeWidth={2.5}
                dot={false}
                activeDot={{
                  r: 7,
                  stroke: "#FFFFFF",
                  strokeWidth: 2.5,
                  fill: COLOR_BTC_PRICE,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  );
}
