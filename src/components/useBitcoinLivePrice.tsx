import { CircularProgress, Paper, Typography } from "@mui/material";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { BtcPrice } from "@/types/types";

export const useBitcoinLivePrice = () => {
  // Fetch BTC price using TanStack Query
  const {
    data: btcLiveData,
    isLoading: btcPriceLoading,
    error: btcPriceError,
  } = useQuery<BtcPrice>({
    queryKey: ["btcprice"],
    queryFn: async () => {
      // const response = await fetch("/api/btcprice");
      const response = await fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
      );
      if (!response.ok) {
        throw new Error("Failed to fetch BTC price");
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes. Enable this to fetch live data periodically
  });

  return {
    btcLiveData,
    BtcLivePriceComponent: (
      <Paper
        sx={{
          p: 2,
          borderRadius: 2,
          backgroundColor: (theme) =>
            theme.palette.mode === "light"
              ? "#f5f5f5"
              : theme.palette.grey[800],
          border: "1px solid",
          borderColor: (theme) =>
            theme.palette.mode === "light"
              ? theme.palette.grey[300]
              : theme.palette.grey[700],
          minWidth: "150px",
        }}
      >
        <Typography
          variant="subtitle2"
          color="text.secondary"
          fontWeight="bold"
        >
          Bitcoin Price
        </Typography>
        {btcLiveData?.price ? (
          <Typography variant="h6" fontWeight="bold" sx={{ mt: 1 }}>
            USD:{" "}
            {(typeof btcLiveData.price === "string"
              ? parseFloat(btcLiveData.price)
              : btcLiveData.price
            ).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Typography>
        ) : (
          <CircularProgress size={20} sx={{ mt: 1 }} />
        )}
      </Paper>
    ),
  };
};
