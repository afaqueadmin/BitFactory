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

interface Ticker24h {
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
}

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

  const { data: ticker24h } = useQuery<Ticker24h>({
    queryKey: ["btc-ticker-24h"],
    queryFn: async () => {
      const response = await fetch(
        "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT",
      );
      if (!response.ok) throw new Error("Failed to fetch 24h ticker");
      return response.json();
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
  });

  const currentPrice = btcLiveData?.price
    ? typeof btcLiveData.price === "string"
      ? parseFloat(btcLiveData.price)
      : btcLiveData.price
    : null;
  const change = ticker24h ? parseFloat(ticker24h.priceChange) : null;
  const changePercent = ticker24h
    ? parseFloat(ticker24h.priceChangePercent)
    : null;
  const isUp = (change ?? 0) >= 0;

  const cardSx = {
    p: { xs: 1.5, sm: 2 },
    borderRadius: 2,
    flex: "1 1 140px",
    backgroundColor: isDark ? theme.palette.grey[800] : "#f5f5f5",
    border: "1px solid",
    borderColor: isDark ? theme.palette.grey[700] : theme.palette.grey[300],
  };

  return (
    <Box
      sx={{
        display: "flex",
        gap: { xs: 1.25, sm: 2 },
        flexWrap: "wrap",
        mb: { xs: 2, md: 3 },
      }}
    >
      <Paper sx={cardSx}>
        <Typography variant="caption" color="text.secondary" fontWeight="bold">
          Bitcoin Price
        </Typography>
        {currentPrice != null ? (
          <Typography variant="h6" fontWeight="bold" sx={{ mt: 0.5 }}>
            {formatCurrency(currentPrice)}
          </Typography>
        ) : (
          <CircularProgress size={20} sx={{ mt: 1 }} />
        )}
      </Paper>

      <Paper sx={cardSx}>
        <Typography variant="caption" color="text.secondary" fontWeight="bold">
          24h Change
        </Typography>
        {change != null && changePercent != null ? (
          <Typography
            variant="h6"
            fontWeight="bold"
            sx={{ mt: 0.5, color: isUp ? "#4caf50" : "#f44336" }}
          >
            {isUp ? "+" : ""}
            {formatCurrency(change)} ({changePercent.toFixed(2)}%)
          </Typography>
        ) : (
          <CircularProgress size={20} sx={{ mt: 1 }} />
        )}
      </Paper>

      <Paper sx={cardSx}>
        <Typography variant="caption" color="text.secondary" fontWeight="bold">
          24h High
        </Typography>
        {ticker24h ? (
          <Typography
            variant="h6"
            fontWeight="bold"
            sx={{ mt: 0.5, color: "#4caf50" }}
          >
            {formatCurrency(parseFloat(ticker24h.highPrice))}
          </Typography>
        ) : (
          <CircularProgress size={20} sx={{ mt: 1 }} />
        )}
      </Paper>

      <Paper sx={cardSx}>
        <Typography variant="caption" color="text.secondary" fontWeight="bold">
          24h Low
        </Typography>
        {ticker24h ? (
          <Typography
            variant="h6"
            fontWeight="bold"
            sx={{ mt: 0.5, color: "#f44336" }}
          >
            {formatCurrency(parseFloat(ticker24h.lowPrice))}
          </Typography>
        ) : (
          <CircularProgress size={20} sx={{ mt: 1 }} />
        )}
      </Paper>
    </Box>
  );
}
