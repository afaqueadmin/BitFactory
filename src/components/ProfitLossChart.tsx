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
        p: { xs: 1.5, sm: 3 },
        width: "100%",
        mt: { xs: 2, md: 3 },
        borderRadius: 3,
      }}
    >
      <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
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
              gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(5, 1fr)" },
              gap: 1.5,
              mb: 2.5,
            }}
          >
            {cards.map((card) => (
              <Box
                key={card.label}
                sx={{
                  p: 1.25,
                  borderRadius: 2,
                  backgroundColor: "action.hover",
                  borderLeft: card.color
                    ? `3px solid ${card.color}`
                    : undefined,
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {card.label}
                </Typography>
                <Typography
                  variant="body1"
                  fontWeight="bold"
                  sx={{ color: card.color }}
                >
                  {formatValue(card.value, "currency")}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Horizontal bars: Total Spent (electricity + hardware) vs Revenue */}
          <Box sx={{ width: "100%", height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
                barCategoryGap="35%"
              >
                <CartesianGrid
                  horizontal={false}
                  stroke={theme.palette.mode === "dark" ? "#333" : "#e8e8e8"}
                />
                <XAxis
                  type="number"
                  domain={[0, axisMax]}
                  tickFormatter={(value: number) =>
                    `$${value >= 1000 ? `${Math.round(value / 1000)}k` : value}`
                  }
                  tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                  axisLine={{ stroke: theme.palette.divider }}
                  tickLine={false}
                  label={{
                    value: "USD",
                    position: "insideBottomRight",
                    offset: -5,
                    fontSize: 11,
                    fill: theme.palette.text.secondary,
                  }}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={{ stroke: theme.palette.divider }}
                  tickLine={false}
                  width={90}
                  tick={{ fontSize: 13, fill: theme.palette.text.primary }}
                />
                <Tooltip
                  formatter={(value) => formatValue(Number(value), "currency")}
                  contentStyle={{
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 8,
                  }}
                />
                <Bar
                  dataKey="electricity"
                  name="Electricity"
                  stackId="row"
                  fill={COLOR_ELECTRICITY}
                  radius={[6, 0, 0, 6]}
                  barSize={36}
                />
                <Bar
                  dataKey="hardware"
                  name="Hardware"
                  stackId="row"
                  fill={COLOR_HARDWARE}
                  radius={[0, 6, 6, 0]}
                  barSize={36}
                />
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  stackId="row"
                  fill={COLOR_REVENUE}
                  radius={[6, 6, 6, 6]}
                  barSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>

          {/* Legend */}
          <Box sx={{ display: "flex", gap: 2.5, flexWrap: "wrap", mt: 1 }}>
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
                    width: 10,
                    height: 10,
                    borderRadius: "2px",
                    backgroundColor: item.color,
                  }}
                />
                <Typography variant="caption" color="text.secondary">
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
