// src/components/MiningEarningsChart.tsx
"use client";

import React from "react";
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
import { Paper, Typography, Box, useTheme } from "@mui/material";

// Sample mining data
const miningData = [
  { date: "2024-10-01", earnings: 12.5, costs: 8.2, hashRate: 45.2 },
  { date: "2024-10-02", earnings: 14.3, costs: 8.2, hashRate: 47.1 },
  { date: "2024-10-03", earnings: 11.8, costs: 8.2, hashRate: 43.5 },
  { date: "2024-10-04", earnings: 15.6, costs: 8.2, hashRate: 48.9 },
  { date: "2024-10-05", earnings: 13.2, costs: 8.2, hashRate: 46.3 },
  { date: "2024-10-06", earnings: 16.8, costs: 8.2, hashRate: 51.2 },
  { date: "2024-10-07", earnings: 12.9, costs: 8.2, hashRate: 44.8 },
];

console.log("Mining data loaded:", miningData);

interface MiningEarningsChartProps {
  title?: string;
  height?: number;
}

export default function MiningEarningsChart({
  title = "Mining Performance",
  height = 300,
}: MiningEarningsChartProps) {
  const theme = useTheme();

  // Debug: Check if data exists
  console.log("Chart rendering with data:", miningData);
  console.log("Chart height:", height);

  return (
    <Paper
      sx={{
        p: 3,
        width: "100%",
        minHeight: height + 80,
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

      <Box sx={{ flex: 1, width: "100%", height: height }}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={miningData}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          >
            <defs>
              <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
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
              tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
              tickFormatter={(value: string | number) => {
                try {
                  return new Date(value).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                } catch {
                  return String(value);
                }
              }}
              height={60}
            />

            <YAxis
              tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
              domain={[0, "dataMax + 2"]}
              label={{
                value: "BTC (₿)",
                angle: -90,
                position: "insideLeft",
                style: {
                  textAnchor: "middle",
                  fill: theme.palette.text.secondary,
                },
              }}
            />

            <Tooltip
              formatter={(value: number | string, name: string) => {
                const num = Number(value);
                return [
                  `$${num.toFixed(2)}`,
                  name === "earnings" ? "Earnings" : "Costs",
                ];
              }}
              labelFormatter={(value) => {
                try {
                  return new Date(value).toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
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
            />

            <Legend />

            <Bar
              dataKey="earnings"
              name="Earnings"
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
    </Paper>
  );
}
