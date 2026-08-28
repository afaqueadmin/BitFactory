"use client";

import { Box, Typography, useTheme } from "@mui/material";
import HostedMinersList from "@/components/HostedMinersList";
import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import ShareEfficiencyCard from "@/components/dashboardCards/ShareEfficiencyCard";
import Uptime24HoursCard from "@/components/dashboardCards/Uptime24HoursCard";
import HashRate24HoursCard from "@/components/dashboardCards/HashRate24HoursCard";
import HashpriceCard from "@/components/dashboardCards/HashpriceCard";
import HashrateHistoryChart from "@/components/HashrateHistoryChart";
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
        p: { xs: 1.5, sm: 2.5, md: 3 },
        mt: { xs: 0.5, md: 1 },
        minHeight: "100vh",
      }}
    >
      {/* Page Heading */}
      <Box sx={{ mb: { xs: 2, md: 3 } }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontWeight: "bold",
            color: "text.primary",
            fontSize: { xs: "1.5rem", sm: "2rem", md: "2.5rem" },
            letterSpacing: "-0.02em",
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
            gap: 0.75,
            mb: { xs: 2, md: 3 },
            overflowX: "auto",
            pb: { xs: 0.5, sm: 0 },
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          <Box
            component="button"
            onClick={() => setPoolMode("total")}
            sx={{
              px: { xs: 1.5, sm: 2 },
              py: { xs: 0.6, sm: 0.75 },
              borderRadius: 2.5,
              border: "none",
              cursor: "pointer",
              fontSize: { xs: "0.75rem", sm: "0.8rem" },
              fontWeight: poolMode === "total" ? 700 : 500,
              whiteSpace: "nowrap",
              backgroundColor:
                poolMode === "total"
                  ? "primary.main"
                  : theme.palette.mode === "dark"
                    ? "rgba(255, 255, 255, 0.06)"
                    : "rgba(0, 0, 0, 0.05)",
              color:
                poolMode === "total"
                  ? "primary.contrastText"
                  : "text.secondary",
              boxShadow:
                poolMode === "total"
                  ? "0 2px 8px rgba(0, 198, 255, 0.35)"
                  : "none",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            Total
          </Box>

          {data.activePoolNames.includes("Luxor") && (
            <Box
              component="button"
              onClick={() => setPoolMode("luxor")}
              sx={{
                px: { xs: 1.5, sm: 2 },
                py: { xs: 0.6, sm: 0.75 },
                borderRadius: 2.5,
                border: "none",
                cursor: "pointer",
                fontSize: { xs: "0.75rem", sm: "0.8rem" },
                fontWeight: poolMode === "luxor" ? 700 : 500,
                whiteSpace: "nowrap",
                backgroundColor:
                  poolMode === "luxor"
                    ? "#1565C0"
                    : theme.palette.mode === "dark"
                      ? "rgba(255, 255, 255, 0.06)"
                      : "rgba(0, 0, 0, 0.05)",
                color: poolMode === "luxor" ? "#FFFFFF" : "text.secondary",
                boxShadow:
                  poolMode === "luxor"
                    ? "0 2px 8px rgba(21, 101, 192, 0.4)"
                    : "none",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              🔷 Luxor
            </Box>
          )}

          {data.activePoolNames.includes("Braiins") && (
            <Box
              component="button"
              onClick={() => setPoolMode("braiins")}
              sx={{
                px: { xs: 1.5, sm: 2 },
                py: { xs: 0.6, sm: 0.75 },
                borderRadius: 2.5,
                border: "none",
                cursor: "pointer",
                fontSize: { xs: "0.75rem", sm: "0.8rem" },
                fontWeight: poolMode === "braiins" ? 700 : 500,
                whiteSpace: "nowrap",
                backgroundColor:
                  poolMode === "braiins"
                    ? "#FB8C00"
                    : theme.palette.mode === "dark"
                      ? "rgba(255, 255, 255, 0.06)"
                      : "rgba(0, 0, 0, 0.05)",
                color: poolMode === "braiins" ? "#FFFFFF" : "text.secondary",
                boxShadow:
                  poolMode === "braiins"
                    ? "0 2px 8px rgba(251, 140, 0, 0.4)"
                    : "none",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              🔶 Braiins
            </Box>
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
          poolMode={poolMode}
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

      {/* Hashrate & Shares Efficiency history — follows the pool toggle above */}
      <HashrateHistoryChart poolMode={poolMode} />

      {/* Pool Comparison Cards - Only show if multiple pools and in total mode */}
      {poolMode === "total" &&
        data.activePoolNames &&
        data.activePoolNames.length > 1 &&
        data.pools && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: { xs: 1.5, sm: 2, md: 3 },
              mb: { xs: 2.5, md: 4 },
            }}
          >
            {/* Luxor Comparison Card */}
            <Box
              sx={{
                p: { xs: 1.75, sm: 2.5 },
                borderRadius: 2.5,
                backgroundColor:
                  theme.palette.mode === "dark"
                    ? "rgba(21, 101, 192, 0.1)"
                    : "rgba(21, 101, 192, 0.04)",
                border: `1px solid ${
                  theme.palette.mode === "dark"
                    ? "rgba(21, 101, 192, 0.4)"
                    : "rgba(21, 101, 192, 0.25)"
                }`,
                backdropFilter: "blur(8px)",
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 700,
                  mb: 1.5,
                  color: "#1565C0",
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                }}
              >
                🔷 Luxor Pool
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 1,
                }}
              >
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", fontSize: "0.72rem" }}
                  >
                    Miners
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {data.pools.luxor.miners}
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", fontSize: "0.72rem" }}
                  >
                    Hashrate
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {formatHashrate(data.pools.luxor.hashrate)}
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", fontSize: "0.72rem" }}
                  >
                    Active
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 700, color: "success.main" }}
                  >
                    {data.pools.luxor.activeWorkers}
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Braiins Comparison Card */}
            <Box
              sx={{
                p: { xs: 1.75, sm: 2.5 },
                borderRadius: 2.5,
                backgroundColor:
                  theme.palette.mode === "dark"
                    ? "rgba(255, 165, 0, 0.1)"
                    : "rgba(255, 165, 0, 0.04)",
                border: `1px solid ${
                  theme.palette.mode === "dark"
                    ? "rgba(255, 165, 0, 0.4)"
                    : "rgba(255, 165, 0, 0.25)"
                }`,
                backdropFilter: "blur(8px)",
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 700,
                  mb: 1.5,
                  color: "#FB8C00",
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                }}
              >
                🔶 Braiins Pool
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 1,
                }}
              >
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", fontSize: "0.72rem" }}
                  >
                    Miners
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {data.pools.braiins.miners}
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", fontSize: "0.72rem" }}
                  >
                    Hashrate
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {formatHashrate(data.pools.braiins.hashrate)}
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", fontSize: "0.72rem" }}
                  >
                    Active
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 700, color: "success.main" }}
                  >
                    {data.pools.braiins.activeWorkers}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        )}

      {/* Miner Filter Buttons - Only show if multiple pools */}
      {data.activePoolNames && data.activePoolNames.length > 1 && (
        <Box
          sx={{
            display: "flex",
            gap: 0.75,
            mb: 2.5,
            overflowX: "auto",
            pb: { xs: 0.5, sm: 0 },
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          <Box
            component="button"
            onClick={() => setMinerFilter("all")}
            sx={{
              px: { xs: 1.5, sm: 2 },
              py: { xs: 0.6, sm: 0.75 },
              borderRadius: 2.5,
              border: "none",
              cursor: "pointer",
              fontSize: { xs: "0.75rem", sm: "0.8rem" },
              fontWeight: minerFilter === "all" ? 700 : 500,
              whiteSpace: "nowrap",
              backgroundColor:
                minerFilter === "all"
                  ? "primary.main"
                  : theme.palette.mode === "dark"
                    ? "rgba(255, 255, 255, 0.06)"
                    : "rgba(0, 0, 0, 0.05)",
              color:
                minerFilter === "all"
                  ? "primary.contrastText"
                  : "text.secondary",
              boxShadow:
                minerFilter === "all"
                  ? "0 2px 8px rgba(0, 198, 255, 0.35)"
                  : "none",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            All Miners (
            {(data.pools?.luxor?.miners || 0) +
              (data.pools?.braiins?.miners || 0)}
            )
          </Box>

          {data.activePoolNames.includes("Luxor") && (
            <Box
              component="button"
              onClick={() => setMinerFilter("luxor")}
              sx={{
                px: { xs: 1.5, sm: 2 },
                py: { xs: 0.6, sm: 0.75 },
                borderRadius: 2.5,
                border: "none",
                cursor: "pointer",
                fontSize: { xs: "0.75rem", sm: "0.8rem" },
                fontWeight: minerFilter === "luxor" ? 700 : 500,
                whiteSpace: "nowrap",
                backgroundColor:
                  minerFilter === "luxor"
                    ? "#1565C0"
                    : theme.palette.mode === "dark"
                      ? "rgba(255, 255, 255, 0.06)"
                      : "rgba(0, 0, 0, 0.05)",
                color: minerFilter === "luxor" ? "#FFFFFF" : "text.secondary",
                boxShadow:
                  minerFilter === "luxor"
                    ? "0 2px 8px rgba(21, 101, 192, 0.4)"
                    : "none",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              🔷 Luxor ({data.pools?.luxor?.miners || 0})
            </Box>
          )}

          {data.activePoolNames.includes("Braiins") && (
            <Box
              component="button"
              onClick={() => setMinerFilter("braiins")}
              sx={{
                px: { xs: 1.5, sm: 2 },
                py: { xs: 0.6, sm: 0.75 },
                borderRadius: 2.5,
                border: "none",
                cursor: "pointer",
                fontSize: { xs: "0.75rem", sm: "0.8rem" },
                fontWeight: minerFilter === "braiins" ? 700 : 500,
                whiteSpace: "nowrap",
                backgroundColor:
                  minerFilter === "braiins"
                    ? "#FB8C00"
                    : theme.palette.mode === "dark"
                      ? "rgba(255, 255, 255, 0.06)"
                      : "rgba(0, 0, 0, 0.05)",
                color: minerFilter === "braiins" ? "#FFFFFF" : "text.secondary",
                boxShadow:
                  minerFilter === "braiins"
                    ? "0 2px 8px rgba(251, 140, 0, 0.4)"
                    : "none",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              🔶 Braiins ({data.pools?.braiins?.miners || 0})
            </Box>
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
