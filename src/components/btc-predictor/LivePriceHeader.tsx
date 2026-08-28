"use client";

import React from "react";
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  useTheme,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useBitcoinLivePrice } from "@/components/useBitcoinLivePrice";
import {
  fetchLiveBtc24hStats,
  Btc24hStats,
} from "@/lib/services/btcPriceService";

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export default function LivePriceHeader() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { btcLiveData } = useBitcoinLivePrice();

  const { data: ticker24h } = useQuery<Btc24hStats>({
    queryKey: ["btc-ticker-24h"],
    queryFn: async () => {
      return await fetchLiveBtc24hStats();
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
  });

  const currentPrice = btcLiveData?.price
    ? typeof btcLiveData.price === "string"
      ? parseFloat(btcLiveData.price)
      : btcLiveData.price
    : (ticker24h?.price ?? null);
  const change = ticker24h ? ticker24h.priceChange : null;
  const changePercent = ticker24h ? ticker24h.priceChangePercent : null;
  const isUp = (change ?? 0) >= 0;

  const cardSx = {
    p: { xs: 1.5, sm: 2 },
    borderRadius: 2.5,
    backgroundColor: isDark
      ? "rgba(255, 255, 255, 0.03)"
      : "rgba(0, 0, 0, 0.02)",
    border: `1px solid ${
      isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)"
    }`,
    boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
  };

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
        gap: { xs: 1.25, sm: 2 },
        mb: { xs: 2, md: 3 },
      }}
    >
      <Paper sx={cardSx}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 600, fontSize: { xs: "0.7rem", sm: "0.75rem" } }}
        >
          Bitcoin Price
        </Typography>
        {currentPrice != null ? (
          <Typography
            variant="h6"
            fontWeight="800"
            sx={{
              mt: 0.5,
              fontSize: { xs: "1rem", sm: "1.2rem" },
              letterSpacing: "-0.01em",
            }}
          >
            {formatCurrency(currentPrice)}
          </Typography>
        ) : (
          <CircularProgress size={18} sx={{ mt: 1 }} />
        )}
      </Paper>

      <Paper sx={cardSx}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 600, fontSize: { xs: "0.7rem", sm: "0.75rem" } }}
        >
          24h Change
        </Typography>
        {change != null && changePercent != null ? (
          <Typography
            variant="h6"
            fontWeight="800"
            sx={{
              mt: 0.5,
              color: isUp ? "#4caf50" : "#f44336",
              fontSize: { xs: "0.95rem", sm: "1.15rem" },
            }}
          >
            {isUp ? "+" : ""}
            {changePercent.toFixed(2)}%
          </Typography>
        ) : (
          <CircularProgress size={18} sx={{ mt: 1 }} />
        )}
      </Paper>

      <Paper sx={cardSx}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 600, fontSize: { xs: "0.7rem", sm: "0.75rem" } }}
        >
          24h High
        </Typography>
        {ticker24h ? (
          <Typography
            variant="h6"
            fontWeight="700"
            sx={{
              mt: 0.5,
              color: "#4caf50",
              fontSize: { xs: "0.95rem", sm: "1.15rem" },
            }}
          >
            {formatCurrency(ticker24h.highPrice)}
          </Typography>
        ) : (
          <CircularProgress size={18} sx={{ mt: 1 }} />
        )}
      </Paper>

      <Paper sx={cardSx}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 600, fontSize: { xs: "0.7rem", sm: "0.75rem" } }}
        >
          24h Low
        </Typography>
        {ticker24h ? (
          <Typography
            variant="h6"
            fontWeight="700"
            sx={{
              mt: 0.5,
              color: "#f44336",
              fontSize: { xs: "0.95rem", sm: "1.15rem" },
            }}
          >
            {formatCurrency(ticker24h.lowPrice)}
          </Typography>
        ) : (
          <CircularProgress size={18} sx={{ mt: 1 }} />
        )}
      </Paper>
    </Box>
  );
}
