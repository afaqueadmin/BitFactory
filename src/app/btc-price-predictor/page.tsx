"use client";

import React from "react";
import { Box, Typography, Container, Paper, useTheme } from "@mui/material";
import PsychologyIcon from "@mui/icons-material/Psychology";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import NewspaperIcon from "@mui/icons-material/Newspaper";
import AppBarComponent from "@/components/AppBar";
import UserFooter from "@/components/UserFooter";
import { useBtcMarketInsights } from "@/hooks/useBtcMarketInsights";
import { useBtcNews } from "@/hooks/useBtcNews";
import LivePriceHeader from "@/components/btc-predictor/LivePriceHeader";
import FearGreedGauge from "@/components/btc-predictor/FearGreedGauge";
import CoinGeckoStatsCard from "@/components/btc-predictor/CoinGeckoStatsCard";
import NewsFeed from "@/components/btc-predictor/NewsFeed";
import PolymarketEmbed from "@/components/btc-predictor/PolymarketEmbed";

function SectionHeading({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        mb: subtitle ? 0.5 : 2,
      }}
    >
      {icon}
      <Typography variant="h6" fontWeight="bold">
        {title}
      </Typography>
    </Box>
  );
}

export default function BTCPricePredictorPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { insights, isLoading: insightsLoading } = useBtcMarketInsights();
  const { articles, isLoading: newsLoading, isError: newsError } = useBtcNews();

  const paperSx = {
    p: { xs: 2, sm: 3 },
    borderRadius: 2,
    backgroundColor: isDark ? theme.palette.grey[900] : "#ffffff",
  };

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
          variant="body2"
          color="text.secondary"
          sx={{ mb: { xs: 2, md: 3 } }}
        >
          Live price, market sentiment, prediction markets, and news for Bitcoin
          — all in one place.
        </Typography>

        <LivePriceHeader />

        {/* Market Sentiment */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: { xs: 2, md: 3 },
            mb: { xs: 2, md: 3 },
          }}
        >
          <Paper sx={paperSx}>
            <SectionHeading
              icon={<PsychologyIcon color="primary" />}
              title="Fear & Greed Index"
            />
            <FearGreedGauge
              data={insights?.fearGreed}
              isLoading={insightsLoading}
            />
          </Paper>

          <Paper sx={paperSx}>
            <SectionHeading
              icon={<QueryStatsIcon color="primary" />}
              title="CoinGecko Market Stats"
            />
            <CoinGeckoStatsCard
              data={insights?.coingecko}
              isLoading={insightsLoading}
            />
          </Paper>
        </Box>

        {/* Prediction Markets & News */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: { xs: 2, md: 3 },
            mb: { xs: 2, md: 3 },
          }}
        >
          <Paper sx={paperSx}>
            <SectionHeading
              icon={<ShowChartIcon color="primary" />}
              title="Polymarket"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Community-driven prediction market probabilities for Bitcoin price
              outcomes.
            </Typography>
            <PolymarketEmbed />
          </Paper>

          <Paper sx={paperSx}>
            <SectionHeading
              icon={<NewspaperIcon color="primary" />}
              title="Latest Bitcoin News"
            />
            <Box sx={{ mt: 2 }}>
              <NewsFeed
                articles={articles}
                isLoading={newsLoading}
                isError={newsError}
              />
            </Box>
          </Paper>
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 3, textAlign: "center" }}
        >
          Prediction markets are speculative indicators reflecting crowd
          positioning, not financial advice.
        </Typography>
      </Container>

      <UserFooter />
    </Box>
  );
}
