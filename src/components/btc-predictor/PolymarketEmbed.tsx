"use client";

import React from "react";
import { Box } from "@mui/material";

export default function PolymarketEmbed() {
  return (
    <Box sx={{ width: "100%", overflow: "hidden", borderRadius: 1 }}>
      <Box
        sx={{
          position: "relative",
          width: "100%",
          height: { xs: "600px", sm: "550px", md: "500px" },
          maxWidth: 700,
          mx: "auto",
        }}
      >
        <iframe
          title="polymarket-market-iframe"
          src="https://embed.polymarket.com/market?event=what-price-will-bitcoin-hit-before-2027&theme=dark&buttons=false&border=true&height=500&width=700"
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
