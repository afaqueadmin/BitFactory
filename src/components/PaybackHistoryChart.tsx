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
} from "@mui/material";
import { formatValue } from "@/lib/helpers/formatValue";
import { MinerModel } from "@/lib/helpers/paybackCalculations";
import {
  usePaybackHistory,
  PaybackHistoryProfile,
} from "@/hooks/usePaybackHistory";
import {
  PAYBACK_HISTORY_RANGES,
  PaybackHistoryRange,
} from "@/lib/helpers/paybackHistoryRange";
import { mapSnapshotsToChartSeries } from "@/lib/helpers/paybackChartMapping";

const RANGE_LABELS: Record<PaybackHistoryRange, string> = {
  "30D": "30D",
  "90D": "90D",
  "1Y": "1Y",
  ALL: "All",
};

const COLOR_STOCK_OS = "#1565C0"; // blue
const COLOR_CUSTOM_OS = "#67B12A"; // green
const COLOR_BTC_PRICE = "#FFA500"; // orange

interface PaybackHistoryChartProps {
  profile: PaybackHistoryProfile;
  miner: MinerModel;
  height?: number;
}

interface TooltipEntry {
  name: string;
  value: number;
  color: string;
}

export default function PaybackHistoryChart({
  profile,
  miner,
  height = 320,
}: PaybackHistoryChartProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [range, setRange] = useState<PaybackHistoryRange>("30D");

  const { historyData, isLoading, isError, error } = usePaybackHistory(
    profile,
    miner,
    range,
  );

  const chartData = useMemo(
    () => mapSnapshotsToChartSeries(historyData),
    [historyData],
  );

  return (
    <Paper
      sx={{
        p: { xs: 1.5, sm: 3 },
        width: "100%",
        mb: 3,
        borderRadius: 3,
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          gap: 1.5,
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Cost to Mine vs Buy BTC
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Market BTC price vs. Stock OS and Custom OS breakeven price over
            time
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
          <CircularProgress />
        </Box>
      )}

      {!isLoading && isError && (
        <Box sx={{ height }}>
          <Alert severity="error">
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
                top: 8,
                right: isMobile ? 8 : 24,
                left: isMobile ? 0 : 8,
                bottom: 0,
              }}
            >
              <CartesianGrid
                vertical={false}
                stroke={theme.palette.mode === "dark" ? "#333" : "#e8e8e8"}
              />
              <XAxis
                dataKey="dateLabel"
                axisLine={false}
                tickLine={false}
                tick={{
                  fontSize: isMobile ? 9 : 11,
                  fill: theme.palette.text.secondary,
                }}
                interval={isMobile ? "preserveStartEnd" : "preserveStartEnd"}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{
                  fontSize: isMobile ? 9 : 11,
                  fill: theme.palette.text.secondary,
                }}
                width={isMobile ? 48 : 60}
                domain={[35000, 70000]}
                ticks={[35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000]}
                tickFormatter={(value: number) =>
                  `$${Math.round(value / 1000)}k`
                }
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;

                  const entries = payload as unknown as TooltipEntry[];

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
                        {label}
                      </Typography>
                      {entries.map((entry) => (
                        <Typography
                          key={entry.name}
                          variant="body2"
                          sx={{ color: entry.color }}
                        >
                          {entry.name}: {formatValue(entry.value, "currency")}
                        </Typography>
                      ))}
                    </Box>
                  );
                }}
              />
              <Legend
                verticalAlign="top"
                align="center"
                iconType="square"
                wrapperStyle={{
                  paddingBottom: 16,
                  fontSize: isMobile ? 11 : 13,
                }}
              />
              <Line
                type="monotone"
                dataKey="stockOsBreakeven"
                name="Stock OS Breakeven"
                stroke={COLOR_STOCK_OS}
                strokeWidth={3}
                dot={{ r: 5, strokeWidth: 0, fill: COLOR_STOCK_OS }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="customOsBreakeven"
                name="Custom OS Breakeven"
                stroke={COLOR_CUSTOM_OS}
                strokeWidth={3}
                dot={{ r: 5, strokeWidth: 0, fill: COLOR_CUSTOM_OS }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="btcPriceUsd"
                name="BTC Market Price"
                stroke={COLOR_BTC_PRICE}
                strokeWidth={3}
                dot={{ r: 5, strokeWidth: 0, fill: COLOR_BTC_PRICE }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  );
}
