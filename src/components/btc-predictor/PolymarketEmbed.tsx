"use client";

import React from "react";
import { Box } from "@mui/material";
import { RADIUS_CONTROL } from "@/lib/daylight";

export default function PolymarketEmbed() {
  return (
    <Box
      sx={{
        width: "100%",
        overflow: "hidden",
        borderRadius: RADIUS_CONTROL,
        // The embed itself is pinned to a dark theme regardless of ours
        // (see the iframe src below); keep a dark backdrop so there's no
        // white flash while it loads.
        backgroundColor: "rgba(0,0,0,0.2)",
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: "100%",
          height: { xs: "520px", sm: "520px", md: "500px" },
          maxWidth: 700,
          mx: "auto",
        }}
      >
        {/* Embed a single active market: with `event=` the widget charts the
            event's first sub-market, which is a closed one with no price
            history, so the chart rendered with no line. */}
        <iframe
          title="polymarket-market-iframe"
          src="https://embed.polymarket.com/market?market=will-bitcoin-reach-100000-by-december-31-2026-571-361-361&theme=dark&buttons=false&border=true&height=500&width=700"
          frameBorder="0"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            display: "block",
          }}
        />
      </Box>
    </Box>
  );
}
