"use client";

import { Box, Typography, useTheme } from "@mui/material";
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
  activePoolNames: string[];
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
    data: minersSummary = {
      data: {
        totalHashrate: 0,
        activeMiners: 0,
        totalRevenue: 0,
        hashprice: 0,
        efficiency_5m: 0,
        uptime_24h: 0,
        activePoolNames: [],
        pools: {
          luxor: {
            miners: 0,
            hashrate: 0,
            activeWorkers: 0,
            hashprice: 0,
            efficiency_5m: 0,
            uptime_24h: 0,
          },
          braiins: {
            miners: 0,
            hashrate: 0,
            activeWorkers: 0,
            hashprice: 0,
            efficiency_5m: 0,
            uptime_24h: 0,
          },
        },
      } as MinersSummary,
    },
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
        return {
          data: {
            totalHashrate: 0,
            activeMiners: 0,
            totalRevenue: 0,
            hashprice: 0,
            efficiency_5m: 0,
            uptime_24h: 0,
            activePoolNames: [],
            pools: {
              luxor: {
                miners: 0,
                hashrate: 0,
                activeWorkers: 0,
                hashprice: 0,
                efficiency_5m: 0,
                uptime_24h: 0,
              },
              braiins: {
                miners: 0,
                hashrate: 0,
                activeWorkers: 0,
                hashprice: 0,
                efficiency_5m: 0,
                uptime_24h: 0,
              },
            },
          },
        };
      }

      const result = await response.json();
      console.log("[Miners Page] API Response Data:", result.data);
      return result;
    },
  });

  const data = minersSummary.data as MinersSummary;

  // Reset poolMode if not applicable
  useEffect(() => {
    if (data.activePoolNames && data.activePoolNames.length > 0) {
      if (!data.activePoolNames.includes("Luxor") && poolMode === "luxor") {
        setPoolMode("total");
      }
      if (!data.activePoolNames.includes("Braiins") && poolMode === "braiins") {
        setPoolMode("total");
      }
    }
  }, [data.activePoolNames]);

  // Log current pool mode selection
  useEffect(() => {
    console.log(`[Miners Page] Pool Mode Changed: ${poolMode}`, {
      hashrate: data.pools?.[poolMode as keyof typeof data.pools]?.hashrate,
      efficiency_5m:
        data.pools?.[poolMode as keyof typeof data.pools]?.efficiency_5m,
      uptime_24h: data.pools?.[poolMode as keyof typeof data.pools]?.uptime_24h,
      hashprice: data.pools?.[poolMode as keyof typeof data.pools]?.hashprice,
    });
  }, [poolMode, data]);

  // Get values based on selected pool mode
  const getMetric = (
    metric: "hashrate" | "hashprice" | "efficiency_5m" | "uptime_24h",
  ) => {
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
    <Box
      sx={{
        p: { xs: 1.5, sm: 2, md: 3 },
        mt: { xs: 1, md: 2 },
        minHeight: "100vh",
      }}
    >
      {/* Page Heading */}
      <Box sx={{ mb: { xs: 2, md: 4 } }}>
        <Typography
          variant="h3"
          component="h1"
          sx={{
            fontWeight: "bold",
            color: "text.primary",
            fontSize: { xs: "1.75rem", sm: "2.5rem", md: "3rem" },
          }}
        >
          Miners
        </Typography>
      </Box>

      {/* Pool Mode Toggle Buttons - Only show if multiple pools */}
      {data.activePoolNames && data.activePoolNames.length > 1 && (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            mb: { xs: 2, md: 4 },
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => setPoolMode("total")}
            style={{
              padding: "6px 12px",
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

          {data.activePoolNames.includes("Luxor") && (
            <button
              onClick={() => setPoolMode("luxor")}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontWeight: poolMode === "luxor" ? 600 : 400,
                backgroundColor:
                  poolMode === "luxor"
                    ? "#1565C0"
                    : theme.palette.mode === "dark"
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(0,0,0,0.05)",
                color:
                  poolMode === "luxor" ? "#FFFFFF" : theme.palette.text.primary,
                transition: "all 0.2s",
              }}
            >
              🔷 Luxor
            </button>
          )}

          {data.activePoolNames.includes("Braiins") && (
            <button
              onClick={() => setPoolMode("braiins")}
              style={{
                padding: "6px 12px",
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
          )}
        </Box>
      )}

      {/* 4 gradient stat cards — 2-col on mobile, 4-col on desktop */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr 1fr" },
          gap: { xs: 1.5, sm: 2, md: 3 },
          mb: { xs: 2, md: 4 },
        }}
      >
        <ShareEfficiencyCard
          value={getMetric("efficiency_5m") || 0}
          loading={summaryLoading}
          poolMode={poolMode}
        />
        <HashRate24HoursCard
          value={getMetric("hashrate") || 0}
          loading={summaryLoading}
        />
        <Uptime24HoursCard
          value={getMetric("uptime_24h") || 0}
          loading={summaryLoading}
          poolMode={poolMode}
        />
        <HashpriceCard
          value={getMetric("hashprice") || 0}
          loading={summaryLoading}
          poolMode={poolMode}
        />
      </Box>

      {/* Pool Comparison Cards - Only show if multiple pools and in total mode */}
      {poolMode === "total" &&
        data.activePoolNames &&
        data.activePoolNames.length > 1 &&
        data.pools && (
          <Box
            sx={{
              display: "flex",
              gap: { xs: 2, md: 3 },
              mb: { xs: 2, md: 4 },
              flexDirection: { xs: "column", sm: "row" },
            }}
          >
            {/* Luxor Comparison Card */}
            <Box
              sx={{
                flex: 1,
                p: { xs: 2, sm: 3 },
                borderRadius: 2,
                backgroundColor:
                  theme.palette.mode === "dark"
                    ? "rgba(0, 102, 255, 0.1)"
                    : "rgba(0, 102, 255, 0.05)",
                border: "2px solid #1565C0",
              }}
            >
              <Typography
                variant="h6"
                sx={{ fontWeight: 600, mb: 2, color: "#1565C0" }}
              >
                🔷 Luxor Pool
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Miners: <strong>{data.pools.luxor.miners}</strong>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Hashrate:{" "}
                  <strong>{formatHashrate(data.pools.luxor.hashrate)}</strong>
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
                p: { xs: 2, sm: 3 },
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
                  <strong>{formatHashrate(data.pools.braiins.hashrate)}</strong>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Active:{" "}
                  <strong>{data.pools.braiins.activeWorkers} workers</strong>
                </Typography>
              </Box>
            </Box>
          </Box>
        )}

      {/* Miner Filter Buttons - Only show if multiple pools */}
      {data.activePoolNames && data.activePoolNames.length > 1 && (
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
            All Miners (
            {(data.pools?.luxor?.miners || 0) +
              (data.pools?.braiins?.miners || 0)}
            )
          </button>

          {data.activePoolNames.includes("Luxor") && (
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
                    ? "#1565C0"
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
          )}

          {data.activePoolNames.includes("Braiins") && (
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
          )}
        </Box>
      )}

      {/* Hosted Miners List with Pool Filter */}
      <HostedMinersList
        poolFilter={minerFilter}
        repairButtonLabel="Repair history"
      />
    </Box>
  );
}
