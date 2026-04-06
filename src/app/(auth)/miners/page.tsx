"use client";

import { Box, Typography, useTheme, Button } from "@mui/material";
import HostedMinersList from "@/components/HostedMinersList";
import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import ShareEfficiencyCard from "@/components/dashboardCards/ShareEfficiencyCard";
import Uptime24HoursCard from "@/components/dashboardCards/Uptime24HoursCard";
import HashRate24HoursCard from "@/components/dashboardCards/HashRate24HoursCard";
import HashpriceCard from "@/components/dashboardCards/HashpriceCard";
import { formatHashrate } from "@/lib/workerNormalization";

interface MinersSummary {
  totalHashrate: number;
  activeMiners: number;
  totalRevenue: number;
  hashprice: number;
  efficiency_5m: number;
  uptime_24h: number;
  pools: {
    luxor: {
      miners: number;
      hashrate: number;
      activeWorkers: number;
      hashprice: number;
      efficiency_5m: number;
      uptime_24h: number;
    };
    braiins: {
      miners: number;
      hashrate: number;
      activeWorkers: number;
      hashprice: number;
      efficiency_5m: number;
      uptime_24h: number;
    };
  };
}

export default function Miners() {
  const theme = useTheme();
  const [poolMode, setPoolMode] = useState<"total" | "luxor" | "braiins">(
    "total",
  );
  const [minerFilter, setMinerFilter] = useState<"all" | "luxor" | "braiins">(
    "all",
  );

  // Fetch miners summary using TanStack Query
  const {
    data: minersSummary = { data: {} as MinersSummary },
    isLoading: summaryLoading,
  } = useQuery({
    queryKey: ["miners-summary"],
    queryFn: async () => {
      const response = await fetch("/api/miners/summary", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error("Failed to fetch miners summary");
        return { data: {} };
      }

      const result = await response.json();
      console.log(
        "[Miners Page] API Response Data:",
        result.data
      );
      return result;
    },
  });

  const data = minersSummary.data as MinersSummary;
  
  // Log current pool mode selection
  useEffect(() => {
    console.log(`[Miners Page] Pool Mode Changed: ${poolMode}`, {
      hashrate: data.pools?.[poolMode as keyof typeof data.pools]?.hashrate,
      efficiency_5m: data.pools?.[poolMode as keyof typeof data.pools]?.efficiency_5m,
      uptime_24h: data.pools?.[poolMode as keyof typeof data.pools]?.uptime_24h,
      hashprice: data.pools?.[poolMode as keyof typeof data.pools]?.hashprice,
    });
  }, [poolMode, data]);

  // Get values based on selected pool mode
  const getMetric = (metric: "hashrate" | "hashprice" | "efficiency_5m" | "uptime_24h") => {
    if (poolMode === "total") {
      switch (metric) {
        case "hashrate":
          return data.totalHashrate;
        case "hashprice":
          return data.hashprice;
        case "efficiency_5m":
          return data.efficiency_5m;
        case "uptime_24h":
          return data.uptime_24h;
      }
    } else if (poolMode === "luxor") {
      switch (metric) {
        case "hashrate":
          return data.pools?.luxor?.hashrate;
        case "hashprice":
          return data.pools?.luxor?.hashprice;
        case "efficiency_5m":
          return data.pools?.luxor?.efficiency_5m;
        case "uptime_24h":
          return data.pools?.luxor?.uptime_24h;
      }
    } else {
      switch (metric) {
        case "hashrate":
          return data.pools?.braiins?.hashrate;
        case "hashprice":
          return data.pools?.braiins?.hashprice;
        case "efficiency_5m":
          return data.pools?.braiins?.efficiency_5m;
        case "uptime_24h":
          return data.pools?.braiins?.uptime_24h;
      }
    }
  };

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
        Miners
      </Typography>

      {/* Pool Mode Toggle Buttons */}
      <Box
        sx={{
          display: "flex",
          gap: 1,
          mb: 4,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setPoolMode("total")}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            fontWeight: poolMode === "total" ? 600 : 400,
            backgroundColor:
              poolMode === "total"
                ? theme.palette.primary.main
                : theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.05)",
            color:
              poolMode === "total"
                ? theme.palette.primary.contrastText
                : theme.palette.text.primary,
            transition: "all 0.2s",
          }}
        >
          Total
        </button>

        <button
          onClick={() => setPoolMode("luxor")}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            fontWeight: poolMode === "luxor" ? 600 : 400,
            backgroundColor:
              poolMode === "luxor"
                ? "#0066FF"
                : theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.05)",
            color:
              poolMode === "luxor"
                ? "#FFFFFF"
                : theme.palette.text.primary,
            transition: "all 0.2s",
          }}
        >
          🔷 Luxor
        </button>

        <button
          onClick={() => setPoolMode("braiins")}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            fontWeight: poolMode === "braiins" ? 600 : 400,
            backgroundColor:
              poolMode === "braiins"
                ? "#FFA500"
                : theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.05)",
            color:
              poolMode === "braiins"
                ? "#FFFFFF"
                : theme.palette.text.primary,
            transition: "all 0.2s",
          }}
        >
          🔶 Braiins
        </button>
      </Box>

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
        <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0, minHeight: 200 }}>
          <ShareEfficiencyCard
            value={getMetric("efficiency_5m") || 0}
            loading={summaryLoading}
            poolMode={poolMode}
          />
        </Box>

        <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0, minHeight: 200 }}>
          <HashRate24HoursCard
            value={getMetric("hashrate") || 0}
            loading={summaryLoading}
          />
        </Box>

        <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0, minHeight: 200 }}>
          <Uptime24HoursCard
            value={getMetric("uptime_24h") || 0}
            loading={summaryLoading}
            poolMode={poolMode}
          />
        </Box>

        <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0, minHeight: 200 }}>
          <HashpriceCard
            value={getMetric("hashprice") || 0}
            loading={summaryLoading}
            poolMode={poolMode}
          />
        </Box>
      </Box>

      {/* Pool Comparison Cards */}
      {poolMode === "total" && data.pools && (
        <Box
          sx={{
            display: "flex",
            gap: 3,
            mb: 4,
            flexDirection: { xs: "column", sm: "row" },
          }}
        >
          {/* Luxor Comparison Card */}
          <Box
            sx={{
              flex: 1,
              p: 3,
              borderRadius: 2,
              backgroundColor:
                theme.palette.mode === "dark"
                  ? "rgba(0, 102, 255, 0.1)"
                  : "rgba(0, 102, 255, 0.05)",
              border: "2px solid #0066FF",
            }}
          >
            <Typography
              variant="h6"
              sx={{ fontWeight: 600, mb: 2, color: "#0066FF" }}
            >
              🔷 Luxor Pool
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Miners: <strong>{data.pools.luxor.miners}</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Hashrate:{" "}
                <strong>
                  {formatHashrate(data.pools.luxor.hashrate)}
                </strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Active:{" "}
                <strong>{data.pools.luxor.activeWorkers} workers</strong>
              </Typography>
            </Box>
          </Box>

          {/* Braiins Comparison Card */}
          <Box
            sx={{
              flex: 1,
              p: 3,
              borderRadius: 2,
              backgroundColor:
                theme.palette.mode === "dark"
                  ? "rgba(255, 165, 0, 0.1)"
                  : "rgba(255, 165, 0, 0.05)",
              border: "2px solid #FFA500",
            }}
          >
            <Typography
              variant="h6"
              sx={{ fontWeight: 600, mb: 2, color: "#FFA500" }}
            >
              🔶 Braiins Pool
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Miners: <strong>{data.pools.braiins.miners}</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Hashrate:{" "}
                <strong>
                  {formatHashrate(data.pools.braiins.hashrate)}
                </strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Active:{" "}
                <strong>{data.pools.braiins.activeWorkers} workers</strong>
              </Typography>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: "text.secondary",
                  fontStyle: "italic",
                  mt: 1,
                  opacity: 0.7
                }}
              >
                ℹ️ Braiins API does not provide hashprice data
              </Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* Miner Filter Buttons */}
      <Box sx={{ display: "flex", gap: 1, mb: 3, flexWrap: "wrap" }}>
        <button
          onClick={() => setMinerFilter("all")}
          style={{
            padding: "6px 12px",
            fontSize: "12px",
            borderRadius: "4px",
            border: "none",
            cursor: "pointer",
            fontWeight: minerFilter === "all" ? 600 : 400,
            backgroundColor:
              minerFilter === "all"
                ? theme.palette.primary.main
                : theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.05)",
            color:
              minerFilter === "all"
                ? theme.palette.primary.contrastText
                : theme.palette.text.primary,
            transition: "all 0.2s",
          }}
        >
          All Miners ({(data.pools?.luxor?.miners || 0) + (data.pools?.braiins?.miners || 0)})
        </button>

        <button
          onClick={() => setMinerFilter("luxor")}
          style={{
            padding: "6px 12px",
            fontSize: "12px",
            borderRadius: "4px",
            border: "none",
            cursor: "pointer",
            fontWeight: minerFilter === "luxor" ? 600 : 400,
            backgroundColor:
              minerFilter === "luxor"
                ? "#0066FF"
                : theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.05)",
            color:
              minerFilter === "luxor"
                ? "#FFFFFF"
                : theme.palette.text.primary,
            transition: "all 0.2s",
          }}
        >
          🔷 Luxor ({data.pools?.luxor?.miners || 0})
        </button>

        <button
          onClick={() => setMinerFilter("braiins")}
          style={{
            padding: "6px 12px",
            fontSize: "12px",
            borderRadius: "4px",
            border: "none",
            cursor: "pointer",
            fontWeight: minerFilter === "braiins" ? 600 : 400,
            backgroundColor:
              minerFilter === "braiins"
                ? "#FFA500"
                : theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.05)",
            color:
              minerFilter === "braiins"
                ? "#FFFFFF"
                : theme.palette.text.primary,
            transition: "all 0.2s",
          }}
        >
          🔶 Braiins ({data.pools?.braiins?.miners || 0})
        </button>
      </Box>

      {/* Hosted Miners List with Pool Filter */}
      <HostedMinersList poolFilter={minerFilter} />
    </Box>
  );
}
