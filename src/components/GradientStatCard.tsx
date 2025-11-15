// src/components/GradientStatCard.tsx
"use client";

/**
 * GradientStatCard
 *
 * Reusable gradient information card used in dashboard 4-up row.
 *
 * Props:
 * - title: string
 * - value: string | number
 * - caption?: string
 * - tag?: string
 * - gradient?: string (CSS gradient)
 * - icon?: ReactNode (optional small icon)
 *
 * Design:
 * - Uses specified gradient; in dark mode we add a subtle overlay to improve contrast.
 * - Text is white for readability on gradients.
 */

import React from "react";
import { Box, Typography, useTheme, SvgIcon } from "@mui/material";

export interface GradientStatCardProps {
  title: string;
  value: string | number;
  caption?: string;
  tag?: string;
  gradient?: string;
  icon?: React.ReactNode;
}

export default function GradientStatCard({
  title,
  value,
  caption,
  gradient,
  icon,
}: GradientStatCardProps) {
  const theme = useTheme();

  // default gradient if none provided
  const baseGradient =
    gradient ?? "linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)";

  // apply slight dark overlay in dark mode to improve text contrast
  const overlay =
    theme.palette.mode === "dark"
      ? "linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.2)),"
      : "";

  return (
    <Box
      role="article"
      aria-label={title}
      sx={{
        borderRadius: 2,
        overflow: "hidden",
        boxShadow: "0px 6px 18px rgba(2,6,23,0.06)",
        color: "#fff",
        p: 2,
        minHeight: 120,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-around",
        background: `${overlay} ${baseGradient}`,
      }}
    >
      {/* Middle: title & value */}
      <Box sx={{ display: "flex", alignItems: "center" }}>
        {icon && (
          <SvgIcon sx={{ color: "rgba(255,255,255,0.9)" }}>{icon}</SvgIcon>
        )}
        <Typography variant="subtitle2" sx={{ opacity: 0.95 }}>
          {title}
        </Typography>
      </Box>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }}>
          {value}
        </Typography>
      </Box>

      {/* Caption */}
      {caption && (
        <Typography variant="caption" sx={{ opacity: 0.9 }}>
          {caption}
        </Typography>
      )}
    </Box>
  );
}
