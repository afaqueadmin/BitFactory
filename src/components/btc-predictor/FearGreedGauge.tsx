"use client";

import React from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  useTheme,
} from "@mui/material";
import { FearGreedData } from "@/hooks/useBtcMarketInsights";

interface FearGreedGaugeProps {
  data: FearGreedData | null | undefined;
  isLoading: boolean;
}

const classificationColor = (value: number): string => {
  if (value <= 24) return "#f44336"; // Extreme Fear
  if (value <= 44) return "#ff9800"; // Fear
  if (value <= 55) return "#ffc107"; // Neutral
  if (value <= 75) return "#8bc34a"; // Greed
  return "#4caf50"; // Extreme Greed
};

export default function FearGreedGauge({
  data,
  isLoading,
}: FearGreedGaugeProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!data) {
    return (
      <Alert severity="warning" sx={{ borderRadius: 2 }}>
        Fear &amp; Greed data unavailable right now.
      </Alert>
    );
  }

  const markerColor = classificationColor(data.value);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, mb: 1.5 }}>
        <Typography variant="h3" fontWeight="bold" sx={{ color: markerColor }}>
          {data.value}
        </Typography>
        <Typography
          variant="subtitle1"
          fontWeight="bold"
          color="text.secondary"
        >
          {data.classification}
        </Typography>
      </Box>

      <Box sx={{ position: "relative", pt: 2 }}>
        <Box
          sx={{
            height: 10,
            borderRadius: 5,
            background:
              "linear-gradient(90deg, #f44336 0%, #ff9800 25%, #ffc107 50%, #8bc34a 75%, #4caf50 100%)",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: `calc(${data.value}% - 6px)`,
            width: 0,
            height: 0,
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: `8px solid ${isDark ? "#fff" : "#000"}`,
          }}
        />
      </Box>

      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Extreme Fear
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Extreme Greed
        </Typography>
      </Box>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 2 }}
      >
        Source: alternative.me Crypto Fear &amp; Greed Index
      </Typography>
    </Box>
  );
}
