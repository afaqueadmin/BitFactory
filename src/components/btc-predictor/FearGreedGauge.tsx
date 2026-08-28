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
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
        }}
      >
        <Typography
          variant="h3"
          fontWeight="800"
          sx={{
            color: markerColor,
            fontSize: { xs: "2rem", sm: "2.5rem" },
            lineHeight: 1,
          }}
        >
          {data.value}
        </Typography>
        <Box
          sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: 999,
            backgroundColor: `${markerColor}22`,
            border: `1px solid ${markerColor}44`,
          }}
        >
          <Typography
            variant="subtitle2"
            fontWeight="700"
            sx={{
              color: markerColor,
              fontSize: { xs: "0.8rem", sm: "0.9rem" },
            }}
          >
            {data.classification}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ position: "relative", pt: 2, pb: 1 }}>
        <Box
          sx={{
            height: 12,
            borderRadius: 6,
            background:
              "linear-gradient(90deg, #f44336 0%, #ff9800 25%, #ffc107 50%, #8bc34a 75%, #4caf50 100%)",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            top: 2,
            left: `calc(${Math.min(96, Math.max(4, data.value))}% - 6px)`,
            width: 0,
            height: 0,
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: `10px solid ${isDark ? "#fff" : "#1e293b"}`,
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
          }}
        />
      </Box>

      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: { xs: "0.68rem", sm: "0.75rem" } }}
        >
          0 • Extreme Fear
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: { xs: "0.68rem", sm: "0.75rem" } }}
        >
          100 • Extreme Greed
        </Typography>
      </Box>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 2, fontSize: "0.7rem", opacity: 0.8 }}
      >
        Source: alternative.me Crypto Fear &amp; Greed Index
      </Typography>
    </Box>
  );
}
