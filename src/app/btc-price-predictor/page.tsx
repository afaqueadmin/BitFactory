"use client";

/**
 * BTC Price Predictor page - BitFactory Daylight theme (v1.3)
 *
 * Standalone route (outside the (auth) route group), so it renders its own
 * AppBarComponent/UserFooter and replicates the same Daylight page shell
 * (auth)/layout.tsx gives every other themed client page: pale canvas
 * background, 76px/72px header offset, guide page padding.
 */

import React from "react";
import { Box, Typography } from "@mui/material";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import QueryStatsOutlinedIcon from "@mui/icons-material/QueryStatsOutlined";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import NewspaperOutlinedIcon from "@mui/icons-material/NewspaperOutlined";
import AppBarComponent from "@/components/AppBar";
import UserFooter from "@/components/UserFooter";
import { useBtcMarketInsights } from "@/hooks/useBtcMarketInsights";
import { useBtcNews } from "@/hooks/useBtcNews";
import LivePriceHeader from "@/components/btc-predictor/LivePriceHeader";
import FearGreedGauge from "@/components/btc-predictor/FearGreedGauge";
import CoinGeckoStatsCard from "@/components/btc-predictor/CoinGeckoStatsCard";
import NewsFeed from "@/components/btc-predictor/NewsFeed";
import PolymarketEmbed from "@/components/btc-predictor/PolymarketEmbed";
import { SubaccountFilterProvider } from "@/lib/contexts/subaccountFilter-context";
import { HEADER_HEIGHT, MQ, RADIUS_CARD, useDaylight } from "@/lib/daylight";

function SectionHeading({
  icon,
  title,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "sky" | "mint" | "amber";
}) {
  const { d, fonts } = useDaylight();
  const toneStyles = {
    sky: { bg: d.skySoft, color: d.action },
    mint: { bg: d.mint, color: d.success },
    amber: { bg: d.amber, color: d.warning },
  }[tone];

  return (
    <Box
      sx={{ display: "flex", alignItems: "center", gap: "10px", mb: "16px" }}
    >
      <Box
        aria-hidden
        sx={{
          display: "grid",
          placeItems: "center",
          width: 33,
          height: 33,
          borderRadius: "8px",
          bgcolor: toneStyles.bg,
          color: toneStyles.color,
          flexShrink: 0,
          "& svg": { fontSize: 18 },
        }}
      >
        {icon}
      </Box>
      <Typography
        sx={{
          fontFamily: fonts.heading,
          fontWeight: 750,
          fontSize: 16,
          color: d.text,
        }}
      >
        {title}
      </Typography>
    </Box>
  );
}

export default function BTCPricePredictorPage() {
  const { d, fonts } = useDaylight();
  const { insights, isLoading: insightsLoading } = useBtcMarketInsights();
  const { articles, isLoading: newsLoading, isError: newsError } = useBtcNews();

  const cardSx = {
    p: { xs: "18px", sm: "20px 24px" },
    borderRadius: RADIUS_CARD,
    bgcolor: d.surface,
    border: `1px solid ${d.border}`,
    boxShadow: d.shadow,
  };

  return (
    <SubaccountFilterProvider>
      <Box sx={{ minHeight: "100vh", bgcolor: d.canvas }}>
        <AppBarComponent />
        <Box
          component="main"
          sx={{
            marginTop: `${HEADER_HEIGHT.desktop}px`,
            [MQ.mobile]: { marginTop: `${HEADER_HEIGHT.mobile}px` },
            padding: { xs: "24px 18px", md: "32px 36px" },
          }}
        >
          <Box
            sx={{
              maxWidth: 1600,
              mx: "auto",
              fontFamily: fonts.body,
              color: d.text,
            }}
          >
            {/* Page heading */}
            <Box sx={{ mb: { xs: "20px", md: "26px" } }}>
              <Typography
                component="h1"
                sx={{
                  fontFamily: fonts.heading,
                  fontWeight: 750,
                  fontSize: { xs: 27, md: 32 },
                  lineHeight: 1.3,
                  letterSpacing: "-.035em",
                  color: d.text,
                }}
              >
                BTC Price Analysis
              </Typography>
              <Typography
                sx={{
                  fontSize: { xs: 12, md: 13 },
                  lineHeight: { xs: 1.7, md: 1.5 },
                  color: d.muted,
                  mt: "7px",
                }}
              >
                Live price, market sentiment, prediction markets, and news for
                Bitcoin — all in one place.
              </Typography>
            </Box>

            <LivePriceHeader />

            {/* Market Sentiment */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: { xs: "16px", md: "20px" },
                mb: { xs: "16px", md: "20px" },
              }}
            >
              <Box sx={cardSx}>
                <SectionHeading
                  icon={<PsychologyOutlinedIcon />}
                  title="Fear & Greed Index"
                  tone="sky"
                />
                <FearGreedGauge
                  data={insights?.fearGreed}
                  isLoading={insightsLoading}
                />
              </Box>

              <Box sx={cardSx}>
                <SectionHeading
                  icon={<QueryStatsOutlinedIcon />}
                  title="CoinGecko Market Stats"
                  tone="sky"
                />
                <CoinGeckoStatsCard
                  data={insights?.coingecko}
                  isLoading={insightsLoading}
                />
              </Box>
            </Box>

            {/* Prediction Markets & News */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: { xs: "16px", md: "20px" },
                mb: { xs: "16px", md: "20px" },
              }}
            >
              <Box sx={cardSx}>
                <SectionHeading
                  icon={<ShowChartOutlinedIcon />}
                  title="Polymarket"
                  tone="mint"
                />
                <Typography sx={{ fontSize: 12, color: d.muted, mb: "12px" }}>
                  Community-driven prediction market probabilities for Bitcoin
                  price outcomes.
                </Typography>
                <PolymarketEmbed />
              </Box>

              <Box sx={cardSx}>
                <SectionHeading
                  icon={<NewspaperOutlinedIcon />}
                  title="Latest Bitcoin News"
                  tone="amber"
                />
                <NewsFeed
                  articles={articles}
                  isLoading={newsLoading}
                  isError={newsError}
                />
              </Box>
            </Box>

            <Typography
              sx={{
                display: "block",
                mt: "12px",
                fontSize: 11,
                color: d.muted,
                textAlign: "center",
              }}
            >
              Prediction markets are speculative indicators reflecting crowd
              positioning, not financial advice.
            </Typography>
          </Box>
        </Box>

        <UserFooter />
      </Box>
    </SubaccountFilterProvider>
  );
}
