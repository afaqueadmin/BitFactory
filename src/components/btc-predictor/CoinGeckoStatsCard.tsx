"use client";

import React from "react";
import { Box, Typography, Chip, CircularProgress, Alert } from "@mui/material";
import { CoinGeckoData } from "@/hooks/useBtcMarketInsights";
import { useDaylight } from "@/lib/daylight";

interface CoinGeckoStatsCardProps {
  data: CoinGeckoData | null | undefined;
  isLoading: boolean;
}

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const ChangeChip = ({
  label,
  value,
  fontFamily,
}: {
  label: string;
  value: number | null;
  fontFamily: string;
}) => {
  if (value == null) return null;
  const isUp = value >= 0;
  return (
    <Chip
      size="small"
      label={`${label}: ${isUp ? "+" : ""}${value.toFixed(2)}%`}
      sx={{
        fontFamily,
        fontWeight: 700,
        fontSize: { xs: 10, sm: 11 },
        color: "#fff",
        backgroundColor: isUp ? "#4caf50" : "#f44336",
        height: 24,
      }}
    />
  );
};

export default function CoinGeckoStatsCard({
  data,
  isLoading,
}: CoinGeckoStatsCardProps) {
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
        CoinGecko market data unavailable right now.
      </Alert>
    );
  }

  const upVotes = data.sentimentVotesUpPercentage;
  const downVotes = data.sentimentVotesDownPercentage;

  return (
    <Box sx={{ fontFamily: fonts.body }}>
      <Box
        sx={{
          display: "flex",
          gap: "6px",
          overflowX: "auto",
          pb: "4px",
          mb: "16px",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <ChangeChip
          label="1h"
          value={data.priceChangePercentage1h}
          fontFamily={fonts.body}
        />
        <ChangeChip
          label="24h"
          value={data.priceChangePercentage24h}
          fontFamily={fonts.body}
        />
        <ChangeChip
          label="7d"
          value={data.priceChangePercentage7d}
          fontFamily={fonts.body}
        />
        <ChangeChip
          label="30d"
          value={data.priceChangePercentage30d}
          fontFamily={fonts.body}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px",
          mb: "16px",
          bgcolor: d.canvas,
          p: "12px",
          borderRadius: "10px",
          border: `1px solid ${d.border}`,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: { xs: 10, sm: 11 },
              color: d.muted,
              display: "block",
            }}
          >
            Market Cap Rank
          </Typography>
          <Typography
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 750,
              color: d.action,
              fontSize: { xs: 15, sm: 17 },
              mt: "2px",
            }}
          >
            {data.marketCapRank ? `#${data.marketCapRank}` : "—"}
          </Typography>
        </Box>
        <Box>
          <Typography
            sx={{
              fontSize: { xs: 10, sm: 11 },
              color: d.muted,
              display: "block",
            }}
          >
            All-Time High
          </Typography>
          <Typography
            sx={{
              fontWeight: 700,
              color: d.text,
              fontSize: { xs: 13, sm: 14 },
              mt: "2px",
            }}
          >
            {formatCurrency(data.ath)}{" "}
            <Box
              component="span"
              sx={{ color: d.danger, fontSize: 11, fontWeight: 700 }}
            >
              ({data.athChangePercentage.toFixed(1)}%)
            </Box>
          </Typography>
        </Box>
        <Box sx={{ gridColumn: "1 / -1" }}>
          <Typography
            sx={{
              fontSize: { xs: 10, sm: 11 },
              color: d.muted,
              display: "block",
            }}
          >
            All-Time Low
          </Typography>
          <Typography
            sx={{
              fontWeight: 700,
              color: d.text,
              fontSize: { xs: 13, sm: 14 },
              mt: "2px",
            }}
          >
            {formatCurrency(data.atl)}{" "}
            <Box
              component="span"
              sx={{ color: d.success, fontSize: 11, fontWeight: 700 }}
            >
              (+{data.atlChangePercentage.toFixed(0)}%)
            </Box>
          </Typography>
        </Box>
      </Box>

      {upVotes != null && downVotes != null && (
        <Box sx={{ mt: "8px" }}>
          <Typography
            sx={{
              fontWeight: 650,
              fontSize: { xs: 11, sm: 12 },
              color: d.muted,
            }}
          >
            Community Sentiment
          </Typography>
          <Box
            sx={{
              display: "flex",
              height: 8,
              borderRadius: 4,
              overflow: "hidden",
              mt: "6px",
              backgroundColor: d.border,
            }}
          >
            <Box sx={{ width: `${upVotes}%`, backgroundColor: "#4caf50" }} />
            <Box sx={{ width: `${downVotes}%`, backgroundColor: "#f44336" }} />
          </Box>
          <Box
            sx={{ display: "flex", justifyContent: "space-between", mt: "4px" }}
          >
            <Typography
              sx={{ color: "#257451", fontWeight: 700, fontSize: 11 }}
            >
              {upVotes.toFixed(0)}% Bullish
            </Typography>
            <Typography sx={{ color: d.danger, fontWeight: 700, fontSize: 11 }}>
              {downVotes.toFixed(0)}% Bearish
            </Typography>
          </Box>
        </Box>
      )}

      <Typography
        sx={{ display: "block", mt: "16px", fontSize: 10, color: d.muted }}
      >
        Source: CoinGecko
      </Typography>
    </Box>
  );
}
