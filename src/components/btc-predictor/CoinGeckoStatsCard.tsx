"use client";

import React from "react";
import {
  Box,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  useTheme,
} from "@mui/material";
import { CoinGeckoData } from "@/hooks/useBtcMarketInsights";

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
}: {
  label: string;
  value: number | null;
}) => {
  if (value == null) return null;
  const isUp = value >= 0;
  return (
    <Chip
      size="small"
      label={`${label}: ${isUp ? "+" : ""}${value.toFixed(2)}%`}
      sx={{
        fontWeight: 700,
        fontSize: { xs: "0.7rem", sm: "0.75rem" },
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
        CoinGecko market data unavailable right now.
      </Alert>
    );
  }

  const upVotes = data.sentimentVotesUpPercentage;
  const downVotes = data.sentimentVotesDownPercentage;

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          gap: 0.75,
          overflowX: "auto",
          pb: 0.5,
          mb: 2,
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <ChangeChip label="1h" value={data.priceChangePercentage1h} />
        <ChangeChip label="24h" value={data.priceChangePercentage24h} />
        <ChangeChip label="7d" value={data.priceChangePercentage7d} />
        <ChangeChip label="30d" value={data.priceChangePercentage30d} />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 1.5,
          mb: 2,
          backgroundColor: isDark
            ? "rgba(255, 255, 255, 0.02)"
            : "rgba(0, 0, 0, 0.02)",
          p: 1.5,
          borderRadius: 2,
          border: `1px solid ${
            isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)"
          }`,
        }}
      >
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              fontSize: { xs: "0.68rem", sm: "0.75rem" },
              display: "block",
            }}
          >
            Market Cap Rank
          </Typography>
          <Typography
            variant="body1"
            fontWeight="800"
            color="primary.main"
            sx={{ fontSize: { xs: "0.95rem", sm: "1.1rem" }, mt: 0.25 }}
          >
            {data.marketCapRank ? `#${data.marketCapRank}` : "—"}
          </Typography>
        </Box>
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              fontSize: { xs: "0.68rem", sm: "0.75rem" },
              display: "block",
            }}
          >
            All-Time High
          </Typography>
          <Typography
            variant="body1"
            fontWeight="700"
            sx={{ fontSize: { xs: "0.85rem", sm: "0.95rem" }, mt: 0.25 }}
          >
            {formatCurrency(data.ath)}{" "}
            <Typography
              component="span"
              variant="caption"
              color="#f44336"
              sx={{ fontSize: "0.7rem", fontWeight: 700 }}
            >
              ({data.athChangePercentage.toFixed(1)}%)
            </Typography>
          </Typography>
        </Box>
        <Box sx={{ gridColumn: "1 / -1" }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              fontSize: { xs: "0.68rem", sm: "0.75rem" },
              display: "block",
            }}
          >
            All-Time Low
          </Typography>
          <Typography
            variant="body1"
            fontWeight="700"
            sx={{ fontSize: { xs: "0.85rem", sm: "0.95rem" }, mt: 0.25 }}
          >
            {formatCurrency(data.atl)}{" "}
            <Typography
              component="span"
              variant="caption"
              color="#4caf50"
              sx={{ fontSize: "0.7rem", fontWeight: 700 }}
            >
              (+{data.atlChangePercentage.toFixed(0)}%)
            </Typography>
          </Typography>
        </Box>
      </Box>

      {upVotes != null && downVotes != null && (
        <Box sx={{ mt: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600, fontSize: { xs: "0.7rem", sm: "0.75rem" } }}
          >
            Community Sentiment
          </Typography>
          <Box
            sx={{
              display: "flex",
              height: 8,
              borderRadius: 4,
              overflow: "hidden",
              mt: 0.75,
              backgroundColor: isDark
                ? theme.palette.grey[700]
                : theme.palette.grey[300],
            }}
          >
            <Box sx={{ width: `${upVotes}%`, backgroundColor: "#4caf50" }} />
            <Box sx={{ width: `${downVotes}%`, backgroundColor: "#f44336" }} />
          </Box>
          <Box
            sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}
          >
            <Typography
              variant="caption"
              sx={{ color: "#4caf50", fontWeight: 700, fontSize: "0.72rem" }}
            >
              {upVotes.toFixed(0)}% Bullish
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: "#f44336", fontWeight: 700, fontSize: "0.72rem" }}
            >
              {downVotes.toFixed(0)}% Bearish
            </Typography>
          </Box>
        </Box>
      )}

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 2, fontSize: "0.7rem", opacity: 0.8 }}
      >
        Source: CoinGecko
      </Typography>
    </Box>
  );
}
