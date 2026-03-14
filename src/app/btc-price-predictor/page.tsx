"use client";

import React from "react";
import { Box, Typography, Container, Paper } from "@mui/material";
import AppBarComponent from "@/components/AppBar";
import UserFooter from "@/components/UserFooter";

export default function BTCPricePredictorPage() {
  return (
    <Box>
      <AppBarComponent />

      <Container maxWidth={false} sx={{ mt: "90px", px: 0, mb: 6 }}>
        <Paper elevation={2} sx={{ p: { xs: 2, md: 4 } }}>
          <Typography variant="h4" component="h1" gutterBottom>
            BTC Price Predictor
          </Typography>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Embedded market chart — view community probabilities for where BTC
            may trade before 2027. Use the controls inside the chart to explore.
          </Typography>

          <Box
            sx={{
              width: "100%",
              mx: 0,
              pt: 2,
              textAlign: "center",
              minHeight: "95vh",
            }}
          >
            <iframe
              title="polymarket-market-iframe"
              src="https://embed.polymarket.com/market?event=what-price-will-bitcoin-hit-before-2027&rotate=true&theme=dark&buttons=false&border=true&height=500&width=700"
              width="700"
              height="500"
              frameBorder="0"
              style={{ display: "block", margin: "0 auto" }}
            />
          </Box>
        </Paper>
      </Container>

      <UserFooter />
    </Box>
  );
}
