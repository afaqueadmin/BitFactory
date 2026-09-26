// src/components/BtcPriceLabel.tsx
"use client";

import React from "react";
import { Box, Skeleton, Typography } from "@mui/material";
import { useBitcoinLivePrice } from "@/components/useBitcoinLivePrice";
import { useDaylight } from "@/lib/daylight";

export default function BtcPriceLabel({
  daylight = false,
}: {
  /** Render with the Daylight status-pill styling. */
  daylight?: boolean;
}) {
  const { btcLiveData } = useBitcoinLivePrice();
  const { d, fonts } = useDaylight();

  const price = btcLiveData?.price
    ? typeof btcLiveData.price === "string"
      ? parseFloat(btcLiveData.price)
      : btcLiveData.price
    : null;

  const formattedPrice =
    price != null
      ? price.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;

  if (daylight) {
    return (
      <Box
        role="status"
        aria-label={
          formattedPrice
            ? `Bitcoin price ${formattedPrice}`
            : "Loading Bitcoin price"
        }
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: "7px",
          px: "12px",
          py: "6px",
          borderRadius: "30px",
          bgcolor: d.surface,
          border: `1px solid ${d.border}`,
          color: d.muted,
          fontFamily: fonts.body,
          fontSize: 11,
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            bgcolor: d.success,
          }}
        />
        <span>BTC</span>
        {formattedPrice ? (
          <Box
            component="b"
            sx={{
              color: d.text,
              fontWeight: 650,
              fontSize: 13,
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formattedPrice}
          </Box>
        ) : (
          <Skeleton width={70} height={20} />
        )}
      </Box>
    );
  }

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
      {formattedPrice ? (
        <Typography
          variant="body2"
          fontWeight={700}
          sx={{ whiteSpace: "nowrap" }}
        >
          {formattedPrice}
        </Typography>
      ) : (
        <Skeleton width={70} height={20} />
      )}
    </Box>
  );
}
