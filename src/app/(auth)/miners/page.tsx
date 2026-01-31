"use client";

import { Box, Typography } from "@mui/material";
import HostedMinersList from "@/components/HostedMinersList";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import ShareEfficiencyCard from "@/components/dashboardCards/ShareEfficiencyCard";
import Uptime24HoursCard from "@/components/dashboardCards/Uptime24HoursCard";
import HashRate24HoursCard from "@/components/dashboardCards/HashRate24HoursCard";
import HashpriceCard from "@/components/dashboardCards/HashpriceCard";

export default function Miners() {
  // Fetch luxor summary using TanStack Query
  const { data: luxorSummary = { data: {} }, isLoading: luxorSummaryLoading } =
    useQuery({
      queryKey: ["luxor-summary"],
      queryFn: async () => {
        const response = await fetch(
          "/api/luxor?endpoint=summary&currency=BTC",
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (!response.ok) {
          console.error("Failed to fetch luxor summary");
          return null;
        }

        return response.json();
      },
    });

  return (
    <Box sx={{ p: 3, mt: 2, minHeight: "100vh" }}>
      {/* Page Heading */}
      <Typography
        variant="h3"
        component="h1"
        sx={{
          mb: 4,
          fontWeight: "bold",
          color: "text.primary",
          textAlign: { xs: "center", md: "left" },
        }}
      >
        My Miners
      </Typography>

      {/* 4 gradient stat cards - Full width, 25% each */}
      <Box
        sx={{
          display: "flex",
          gap: 3,
          mb: 4,
          flexDirection: { xs: "column", sm: "row" },
          flexWrap: { xs: "nowrap", sm: "wrap", md: "nowrap" },
        }}
      >
        <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
          <ShareEfficiencyCard
            value={luxorSummary.data.efficiency_5m}
            loading={luxorSummaryLoading}
          />
        </Box>

        <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
          <HashRate24HoursCard
            value={luxorSummary.data.hashrate_24h}
            loading={luxorSummaryLoading}
          />
        </Box>

        <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
          <Uptime24HoursCard
            value={luxorSummary.data.uptime_24h}
            loading={luxorSummaryLoading}
          />
        </Box>

        <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
          <HashpriceCard
            value={
              luxorSummary.data.hashprice
                ? luxorSummary.data.hashprice[0].value
                : ""
            }
            loading={luxorSummaryLoading}
          />
        </Box>
      </Box>

      {/* Hosted Miners List */}
      <HostedMinersList />
    </Box>
  );
}
