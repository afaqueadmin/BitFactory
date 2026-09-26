"use client";

import React from "react";
import { Box, Typography, CircularProgress, Alert } from "@mui/material";
import { FearGreedData } from "@/hooks/useBtcMarketInsights";
import { useDaylight } from "@/lib/daylight";

interface FearGreedGaugeProps {
  data: FearGreedData | null | undefined;
  isLoading: boolean;
}

// Semantic (not brand) colours - matches alternative.me's own scale.
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
  const { d, fonts } = useDaylight();

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={28} sx={{ color: d.action }} />
      </Box>
    );
  }

  if (!data) {
    return (
      <Alert
        severity="warning"
        sx={{
          borderRadius: "8px",
          bgcolor: d.amber,
          color: d.warning,
          fontFamily: fonts.body,
          "& .MuiAlert-icon": { color: d.warning },
        }}
      >
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
          mb: "16px",
        }}
      >
        <Typography
          sx={{
            fontFamily: fonts.heading,
            fontWeight: 750,
            color: markerColor,
            fontSize: { xs: 32, sm: 40 },
            lineHeight: 1,
          }}
        >
          {data.value}
        </Typography>
        <Box
          sx={{
            px: "12px",
            py: "5px",
            borderRadius: "999px",
            backgroundColor: `${markerColor}22`,
            border: `1px solid ${markerColor}44`,
          }}
        >
          <Typography
            sx={{
              fontFamily: fonts.body,
              fontWeight: 700,
              color: markerColor,
              fontSize: { xs: 12, sm: 13 },
            }}
          >
            {data.classification}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ position: "relative", pt: "16px", pb: "8px" }}>
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
            borderTop: `10px solid ${d.text}`,
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
          }}
        />
      </Box>

      <Box sx={{ display: "flex", justifyContent: "space-between", mt: "4px" }}>
        <Typography sx={{ fontSize: { xs: 10, sm: 11 }, color: d.muted }}>
          0 • Extreme Fear
        </Typography>
        <Typography sx={{ fontSize: { xs: 10, sm: 11 }, color: d.muted }}>
          100 • Extreme Greed
        </Typography>
      </Box>

      <Typography
        sx={{ display: "block", mt: "16px", fontSize: 10, color: d.muted }}
      >
        Source: alternative.me Crypto Fear &amp; Greed Index
      </Typography>
    </Box>
  );
}
