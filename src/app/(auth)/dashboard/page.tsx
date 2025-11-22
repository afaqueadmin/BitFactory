// src/app/(auth)/dashboard/page.tsx
"use client";

/**
 * Dashboard page (authenticated)
 *
 * Composes:
 * - DashboardHeader
 * - HostedMinersCard
 * - MarketplaceCard
 * - Four GradientStatCard instances
 *
 * Notes:
 * - This page provides demo/hardcoded values for now.
 * - Individual components are fully data-driven via props.
 *
 * Layout:
 * - Container maxWidth="lg"
 * - Grid breakpoints used to meet responsive requirements
 */

import React from "react";
import {
  Container,
  Box,
  Typography,
  CircularProgress,
  Alert,
  useTheme,
} from "@mui/material";
import DashboardHeader from "@/components/DashboardHeader";
import HostedMinersCard from "@/components/HostedMinersCard";
import MarketplaceCard from "@/components/MarketplaceCard";
import MiningEarningsChart from "@/components/MiningEarningsChart";
import { useUser } from "@/lib/hooks/useUser";
import BalanceCard from "@/components/dashboardCards/BalanceCard";
import CostsCard from "@/components/dashboardCards/CostsCard";
import EstimatedMonthlyCostCard from "@/components/dashboardCards/EstimatedMonthlyCostCard";
import EstimatedMiningDaysLeftCard from "@/components/dashboardCards/EstimatedMiningDaysLeftCard";

export default function DashboardPage() {
  const { loading, error } = useUser();
  const theme = useTheme();

  // demo/hardcoded values (page-level only)
  const hosted = {
    runningCount: 3,
    progress: 66,
    errorCount: 2,
  };

  const marketplace = {
    runningCount: 0,
    comingSoon: true,
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box component="main" sx={{ pt: 2, pb: 4 }}>
      <Container maxWidth="xl">
        {/* Header */}
        <DashboardHeader />

        {/* Top two horizontal cards - 50/50 split */}
        <Box
          sx={{
            display: "flex",
            gap: 4,
            mb: 2,
            flexDirection: { xs: "column", md: "row" },
          }}
        >
          <Box sx={{ flex: 1 }}>
            {/* Hosted miners: 50% width on desktop */}
            <HostedMinersCard
              runningCount={hosted.runningCount}
              progress={hosted.progress}
              errorCount={hosted.errorCount}
              onAddMiner={() => {
                // stub for now, later wire to modal / route
                console.log("ADD MINER clicked from DashboardPage");
              }}
            />
          </Box>
          {/* Marketplace card: 50% width on desktop
              commented out, considering removal */}
          {/* <Box sx={{ flex: 1 }}>
            
            <MarketplaceCard
              runningCount={marketplace.runningCount}
              comingSoon={marketplace.comingSoon}
            />
          </Box> */}
        </Box>

        {/* 4 gradient stat cards - Full width, 25% each */}
        <Box
          sx={{
            display: "flex",
            gap: 3,
            mb: 2,
            flexDirection: { xs: "column", sm: "row" },
            flexWrap: { xs: "nowrap", sm: "wrap", md: "nowrap" },
          }}
        >
          <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
            <BalanceCard value={0.0} />
          </Box>

          <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
            <CostsCard value={12.34} />
          </Box>

          <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
            <EstimatedMiningDaysLeftCard days={7} />
          </Box>

          <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
            <EstimatedMonthlyCostCard value={45.6} />
          </Box>
        </Box>

        {/* Chart Section with Main Heading */}
        <Box sx={{ mt: 4 }}>
          <Typography
            variant="h4"
            fontWeight="bold"
            sx={{
              background: theme.palette.text.primary,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              mb: 3,
              fontSize: { xs: "1.5rem", md: "2rem" },
              textAlign: "left",
            }}
          >
            Total overview of your Hosted Miners
          </Typography>

          <MiningEarningsChart title="Daily Mining Performance" height={400} />
        </Box>
      </Container>
    </Box>
  );
}
