"use client";

import React from "react";
import { Card, CardContent, Typography, Box, useTheme } from "@mui/material";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface StatItem {
  label: string;
  value: number;
  color: string;
}

interface AdminStatCardProps {
  title: string;
  stats: StatItem[];
  total?: number;
  borderColor?: string; // Color for left border (e.g., "#757575" for DB, "#1565C0" for Luxor, etc.)
}

export default function AdminStatCard({
  title,
  stats,
  total,
  borderColor,
}: AdminStatCardProps) {
  const theme = useTheme();

  // Calculate total if not provided
  const totalValue = total ?? stats.reduce((sum, stat) => sum + stat.value, 0);

  // Prepare data for the pie chart
  // When total is 0, distribute equally among stats for visual representation
  const chartData =
    totalValue === 0
      ? stats.map((stat) => ({
          name: stat.label,
          value: 1, // Equal distribution when total is 0
          color: stat.color,
        }))
      : stats.map((stat) => ({
          name: stat.label,
          value: stat.value,
          color: stat.color,
        }));

  return (
    <Card
      sx={{
        borderRadius: 2.5,
        boxShadow: "0px 2px 10px rgba(0, 0, 0, 0.06)",
        border: "1px solid",
        borderColor: (theme) => theme.palette.divider,
        borderLeft: borderColor ? `6px solid ${borderColor}` : "none",
        height: "100%",
        minHeight: { xs: 180, sm: 200, md: 220 },
        backgroundColor: theme.palette.mode === "dark" ? "#1e1e1e" : "#ffffff",
        transition: "box-shadow 0.3s ease",
        "&:hover": {
          boxShadow: "0px 6px 16px rgba(0, 0, 0, 0.12)",
        },
      }}
    >
      <CardContent
        sx={{
          p: { xs: 2.25, sm: 2.75, md: 3 },
          "&:last-child": { pb: { xs: 2.25, sm: 2.75, md: 3 } },
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
          }}
        >
          {/* Left Side - Title and Stats */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="h5"
              component="h2"
              sx={{
                fontWeight: 600,
                mb: { xs: 1.75, sm: 2.5 },
                color: theme.palette.text.primary,
                fontSize: { xs: "1.2rem", sm: "1.35rem", md: "1.5rem" },
              }}
            >
              {title}
            </Typography>

            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: { xs: 1.25, sm: 1.5 },
              }}
            >
              {stats.map((stat, index) => (
                <Box
                  key={index}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                  }}
                >
                  <Box
                    sx={{
                      width: { xs: 12, sm: 14 },
                      height: { xs: 12, sm: 14 },
                      borderRadius: "50%",
                      backgroundColor: stat.color,
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="body1"
                    sx={{
                      color: theme.palette.text.primary,
                      fontSize: { xs: "0.88rem", sm: "0.95rem", md: "1.02rem" },
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {stat.label}{" "}
                    <Box component="span" fontWeight="700">
                      {stat.value}
                    </Box>
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Right Side - Circular Chart */}
          <Box
            sx={{
              width: { xs: 105, sm: 125, md: 140 },
              height: { xs: 105, sm: 125, md: 140 },
              position: "relative",
              flexShrink: 0,
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius="65%"
                  outerRadius="90%"
                  paddingAngle={0}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Center Number */}
            <Box
              sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Typography
                variant="h3"
                sx={{
                  fontWeight: 700,
                  color: theme.palette.text.primary,
                  fontSize: { xs: "1.6rem", sm: "2rem", md: "2.4rem" },
                  lineHeight: 1,
                }}
              >
                {totalValue}
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
