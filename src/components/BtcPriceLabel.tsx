// src/components/BtcPriceLabel.tsx
"use client";

import React from "react";
import { Box, Skeleton, Typography } from "@mui/material";
import { useBitcoinLivePrice } from "@/components/useBitcoinLivePrice";

export default function BtcPriceLabel() {
  const { btcLiveData } = useBitcoinLivePrice();

  const price = btcLiveData?.price
    ? typeof btcLiveData.price === "string"
      ? parseFloat(btcLiveData.price)
      : btcLiveData.price
    : null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.5,
        py: 0.5,
        borderRadius: 999,
        backgroundColor: (theme) =>
          theme.palette.mode === "dark"
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.04)",
        border: "1px solid",
        borderColor: (theme) =>
          theme.palette.mode === "dark"
            ? theme.palette.grey[700]
            : theme.palette.grey[300],
      }}
    >
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: "success.main",
        }}
      />
      <Typography
        variant="caption"
        color="text.secondary"
        fontWeight={600}
        sx={{ whiteSpace: "nowrap" }}
      >
        BTC
      </Typography>
      {price != null ? (
        <Typography
          variant="body2"
          fontWeight={700}
          sx={{ whiteSpace: "nowrap" }}
        >
          {price.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Typography>
      ) : (
        <Skeleton width={70} height={20} />
      )}
    </Box>
  );
}
