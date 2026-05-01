"use client";

import React from "react";
import { Box, Typography, Container, Paper } from "@mui/material";
import AppBarComponent from "@/components/AppBar";
import UserFooter from "@/components/UserFooter";

export default function BTCPricePredictorPage() {
  return (
    <Box>
      <AppBarComponent />

      <Container
        maxWidth="lg"
        sx={{
          mt: { xs: "72px", sm: "90px" },
          px: { xs: 1.5, sm: 2, md: 3 },
          mb: 6,
        }}
      >
        <Paper elevation={2} sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
          <Typography
            variant="h4"
            component="h1"
            gutterBottom
            sx={{
              fontSize: { xs: "1.6rem", sm: "2rem", md: "2.125rem" },
              fontWeight: "bold",
            }}
          >
            BTC Price Analysis
          </Typography>

          <Typography
            variant="h6"
            sx={{ mb: 1.5, fontSize: { xs: "1rem", sm: "1.25rem" } }}
          >
            Polymarket BTC Price Prediction Charts
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: { xs: 2, md: 3 } }}
          >
            Polymarket is a community-driven prediction market — this chart
            shows aggregated market probabilities for Bitcoin price outcomes.
          </Typography>

          <Box
            sx={{
              width: "100%",
              pt: 1,
              overflow: "hidden",
              borderRadius: 1,
            }}
          >
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
                src="https://embed.polymarket.com/market?event=what-price-will-bitcoin-hit-before-2027&rotate=true&theme=dark&buttons=false&border=true&height=500&width=700"
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
        </Paper>
      </Container>

      <UserFooter />
    </Box>
  );
}
