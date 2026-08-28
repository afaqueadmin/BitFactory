"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
import { formatValue } from "@/lib/helpers/formatValue";

interface ProfitLossTotals {
  electricityCostTotal: number;
  hardwareCostTotal: number;
  totalCosts: number;
}

interface ProfitLossResponse {
  totals: ProfitLossTotals;
}

interface ProfitLossChartProps {
  totalEarningsBtc: number;
  btcPriceUsd: number | null | undefined;
}

const COLOR_ELECTRICITY = "#ffb300";
const COLOR_HARDWARE = "#5c6bc0";
const COLOR_REVENUE = "#00bfa5";
const COLOR_PROFIT = "#4caf50";
const COLOR_LOSS = "#f44336";

export default function ProfitLossChart({
  totalEarningsBtc,
  btcPriceUsd,
}: ProfitLossChartProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isDark = theme.palette.mode === "dark";
  const [data, setData] = useState<ProfitLossResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfitLoss = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/wallet/profit-loss", {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch profit & loss data");
        }

        setData(await response.json());
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load profit & loss data",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchProfitLoss();
  }, []);

  const revenueUsd = totalEarningsBtc * (btcPriceUsd || 0);
  const electricityCost = data?.totals.electricityCostTotal ?? 0;
  const hardwareCost = data?.totals.hardwareCostTotal ?? 0;
  const totalCosts = data?.totals.totalCosts ?? 0;
  const grossProfit = revenueUsd - electricityCost;
  const netProfitLoss = revenueUsd - totalCosts;

  const chartData = [
    {
      name: "Total Spent",
      electricity: electricityCost,
      hardware: hardwareCost,
      revenue: 0,
    },
    {
      name: "Revenue",
      electricity: 0,
      hardware: 0,
      revenue: revenueUsd,
    },
  ];

  const axisMax = Math.max(totalCosts, revenueUsd) * 1.1 || 1;

  const cards = [
    { label: "BTC Mined Revenue", value: revenueUsd, color: COLOR_REVENUE },
    {
      label: "Electricity Paid",
      value: electricityCost,
      color: COLOR_ELECTRICITY,
    },
    { label: "Hardware Paid", value: hardwareCost, color: COLOR_HARDWARE },
    {
      label: "Gross Profit",
      value: grossProfit,
      color: grossProfit >= 0 ? COLOR_PROFIT : COLOR_LOSS,
    },
    {
      label: netProfitLoss >= 0 ? "Net Profit" : "Net Cash Flow",
      value: netProfitLoss,
      color: netProfitLoss >= 0 ? COLOR_PROFIT : COLOR_LOSS,
    },
  ];

  return (
    <Paper
      sx={{
        p: { xs: 1.75, sm: 3 },
        width: "100%",
        mt: { xs: 2, md: 3 },
        borderRadius: 3,
        border: `1px solid ${
          isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)"
        }`,
      }}
    >
      <Typography
        variant="h6"
        fontWeight="700"
        sx={{ mb: 2, fontSize: { xs: "1rem", sm: "1.2rem" } }}
      >
        Profit &amp; Loss
      </Typography>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        <>
          {/* Small stat cards */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr 1fr",
                sm: "repeat(3, 1fr)",
                md: "repeat(5, 1fr)",
              },
              gap: { xs: 1, sm: 1.5 },
              mb: 2.5,
            }}
          >
            {cards.map((card, idx) => (
              <Box
                key={card.label}
                sx={{
                  p: { xs: 1, sm: 1.25 },
                  borderRadius: 2,
                  backgroundColor: isDark
                    ? "rgba(255, 255, 255, 0.03)"
                    : "rgba(0, 0, 0, 0.02)",
                  border: `1px solid ${
                    isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)"
                  }`,
                  borderLeft: card.color
                    ? `3px solid ${card.color}`
                    : undefined,
                  ...(idx === cards.length - 1
                    ? { gridColumn: { xs: "1 / -1", sm: "auto" } }
                    : {}),
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontSize: { xs: "0.68rem", sm: "0.75rem" },
                    display: "block",
                    fontWeight: 500,
                  }}
                >
                  {card.label}
                </Typography>
                <Typography
                  variant="body1"
                  fontWeight="700"
                  sx={{
                    color: card.color,
                    fontSize: { xs: "0.9rem", sm: "1.05rem" },
                    mt: 0.25,
                  }}
                >
                  {formatValue(card.value, "currency")}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Horizontal bars: Total Spent (electricity + hardware) vs Revenue */}
          <Box
            sx={{
              width: "100%",
              height: isMobile ? 170 : 160,
              touchAction: "pan-y",
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{
                  top: 0,
                  right: isMobile ? 12 : 24,
                  left: isMobile ? -14 : 0,
                  bottom: 0,
                }}
                barCategoryGap="30%"
              >
                <CartesianGrid
                  horizontal={false}
                  stroke={isDark ? "rgba(255,255,255,0.08)" : "#e8e8e8"}
                />
                <XAxis
                  type="number"
                  domain={[0, axisMax]}
                  tickFormatter={(value: number) =>
                    `$${value >= 1000 ? `${Math.round(value / 1000)}k` : value}`
                  }
                  tick={{
                    fontSize: isMobile ? 10 : 12,
                    fill: theme.palette.text.secondary,
                  }}
                  axisLine={{ stroke: theme.palette.divider }}
                  tickLine={false}
                  label={{
                    value: "USD",
                    position: "insideBottomRight",
                    offset: -5,
                    fontSize: 10,
                    fill: theme.palette.text.secondary,
                  }}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={{ stroke: theme.palette.divider }}
                  tickLine={false}
                  width={isMobile ? 76 : 90}
                  tick={{
                    fontSize: isMobile ? 11 : 13,
                    fill: theme.palette.text.primary,
                    fontWeight: 600,
                  }}
                />
                <Tooltip
                  formatter={(value) => formatValue(Number(value), "currency")}
                  contentStyle={{
                    backgroundColor: isDark ? "rgba(15, 23, 42, 0.95)" : "#fff",
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 8,
                    fontSize: "0.8rem",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                  }}
                />
                <Bar
                  dataKey="electricity"
                  name="Electricity"
                  stackId="row"
                  fill={COLOR_ELECTRICITY}
                  radius={[4, 0, 0, 4]}
                  barSize={isMobile ? 26 : 34}
                />
                <Bar
                  dataKey="hardware"
                  name="Hardware"
                  stackId="row"
                  fill={COLOR_HARDWARE}
                  radius={[0, 4, 4, 0]}
                  barSize={isMobile ? 26 : 34}
                />
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  stackId="row"
                  fill={COLOR_REVENUE}
                  radius={[4, 4, 4, 4]}
                  barSize={isMobile ? 26 : 34}
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>

          {/* Legend */}
          <Box
            sx={{
              display: "flex",
              gap: { xs: 1.5, sm: 2.5 },
              flexWrap: "wrap",
              mt: 1.5,
            }}
          >
            {[
              { label: "Electricity", color: COLOR_ELECTRICITY },
              { label: "Hardware", color: COLOR_HARDWARE },
              { label: "Revenue", color: COLOR_REVENUE },
            ].map((item) => (
              <Box
                key={item.label}
                sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
              >
                <Box
                  sx={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    backgroundColor: item.color,
                  }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: "0.75rem", fontWeight: 500 }}
                >
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Paper>
  );
}
