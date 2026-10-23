"use client";

import React from "react";
import { Card, CardContent, Typography, Box, useTheme } from "@mui/material";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

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
  /** Daylight styling (admin dashboard). `borderColor` becomes a small
   * data-source marker next to the title instead of a thick left border. */
  daylight?: boolean;
}

export default function AdminStatCard({
  title,
  stats,
  total,
  borderColor,
  daylight = false,
}: AdminStatCardProps) {
  const theme = useTheme();
  const { d, fonts } = useDaylight();

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

  if (daylight) {
    return (
      <Box
        role="article"
        aria-label={title}
        sx={{
          minWidth: 0,
          height: "100%",
          bgcolor: d.surface,
          border: `1px solid ${d.border}`,
          borderRadius: RADIUS_CARD,
          boxShadow: d.shadow,
          p: { xs: "16px", sm: "20px" },
          fontFamily: fonts.body,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Title row spans the card; labels + ring share the row below. */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            mb: "14px",
          }}
        >
          {borderColor && (
            <Box
              aria-hidden
              sx={{
                width: 8,
                height: 8,
                borderRadius: "2px",
                bgcolor: borderColor,
                flexShrink: 0,
              }}
            />
          )}
          <Typography
            component="h2"
            sx={{
              m: 0,
              fontFamily: fonts.heading,
              fontWeight: 700,
              fontSize: { xs: 15, md: 16 },
              lineHeight: 1.3,
              color: d.text,
            }}
          >
            {title}
          </Typography>
        </Box>

        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <Box
            component="ul"
            sx={{
              // Shrinks only after the ring has reached its 64px minimum (the
              // ring's much larger shrink factor makes it give way first);
              // then a value wraps under its label.
              flexShrink: 1,
              minWidth: 0,
              listStyle: "none",
              m: 0,
              p: 0,
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {stats.map((stat) => (
              <Box
                component="li"
                key={stat.label}
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  fontSize: { xs: 13, md: 14 },
                  lineHeight: 1.4,
                  fontWeight: 500,
                  color: d.muted,
                }}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 10,
                    height: 10,
                    // Centre on the first text line (1.4 line-height).
                    mt: "calc(0.7em - 5px)",
                    borderRadius: "50%",
                    bgcolor: stat.color,
                    flexShrink: 0,
                  }}
                />
                <Box
                  component="span"
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    columnGap: "8px",
                    minWidth: 0,
                    "& > span": { whiteSpace: "nowrap" },
                  }}
                >
                  <span>{stat.label}</span>
                  <Box
                    component="span"
                    sx={{
                      fontWeight: 700,
                      color: d.text,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {stat.value}
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>

          <Box
            sx={{
              // Gives way before the labels (92px max, 64px min) so the two
              // never wrap or overlap. The centre number scales with the
              // ring via container units.
              flex: "0 1000 92px",
              minWidth: 64,
              aspectRatio: "1 / 1",
              containerType: "inline-size",
              position: "relative",
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius="72%"
                  outerRadius="94%"
                  paddingAngle={totalValue === 0 ? 0 : 2}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={totalValue === 0 ? d.border : entry.color}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                fontFamily: fonts.heading,
                fontWeight: 750,
                fontSize: "clamp(14px, 23cqi, 21px)",
                letterSpacing: "-.5px",
                lineHeight: 1,
                color: d.text,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {totalValue}
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

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
