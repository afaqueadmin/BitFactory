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
  useMediaQuery,
} from "@mui/material";
import DashboardHeader from "@/components/DashboardHeader";
import HostedMinersCard from "@/components/HostedMinersCard";
import MiningEarningsChart from "@/components/MiningEarningsChart";
import { useUser } from "@/lib/hooks/useUser";
import BalanceCard from "@/components/dashboardCards/BalanceCard";
import CostsCard from "@/components/dashboardCards/CostsCard";
import EstimatedMonthlyCostCard from "@/components/dashboardCards/EstimatedMonthlyCostCard";
import EstimatedMiningDaysLeftCard from "@/components/dashboardCards/EstimatedMiningDaysLeftCard";
import { formatValue } from "@/lib/helpers/formatValue";
import { getDaysInCurrentMonth } from "@/lib/helpers/getDaysInCurrentMonth";

export default function DashboardPage() {
  const { loading, error } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [balance, setBalance] = React.useState<number>(0);
  const [balanceLoading, setBalanceLoading] = React.useState(true);
  const [dailyCost, setDailyCost] = React.useState<number>(0);
  const [dailyCostLoading, setDailyCostLoading] = React.useState(true);
  const [minersSummary, setMinersSummary] = React.useState<{
    activePoolNames: string[];
    pools: {
      luxor: { miners: number };
      braiins: { miners: number };
    };
  }>({
    activePoolNames: [],
    pools: {
      luxor: { miners: 0 },
      braiins: { miners: 0 },
    },
  });
  const [minersSummaryLoading, setMinersSummaryLoading] = React.useState(true);

  // Workers stats state
  const [workersStats, setWorkersStats] = React.useState<{
    activeWorkers: number;
    inactiveWorkers: number;
    activePoolNames: string[];
    poolBreakdown?: {
      luxor: { activeWorkers: number; inactiveWorkers: number };
      braiins: { activeWorkers: number; inactiveWorkers: number };
    };
  }>({
    activeWorkers: 0,
    inactiveWorkers: 0,
    activePoolNames: [],
  });
  const [workersLoading, setWorkersLoading] = React.useState(true);
  const [workersError, setWorkersError] = React.useState<string | null>(null);

  // Chart view mode state
  const [chartMode, setChartMode] = React.useState<
    "total" | "luxor" | "braiins" | "sideBySide"
  >("total");

  // Mining Performance chart granularity: daily (last 31 days) or monthly
  // (every fully-closed calendar month since data began).
  const [granularity, setGranularity] = React.useState<"daily" | "monthly">(
    "daily",
  );

  const estimatedMonthlyCost = React.useMemo(() => {
    if (dailyCostLoading) return 0;
    return dailyCost * getDaysInCurrentMonth();
  }, [dailyCost, dailyCostLoading]);

  const daysLeft = React.useMemo(() => {
    if (balanceLoading || dailyCostLoading) return 0;
    if (dailyCost === 0) return "∞";
    return Number(
      formatValue(balance / dailyCost, "number", { maximumFractionDigits: 0 }),
    );
  }, [balance, balanceLoading, dailyCost, dailyCostLoading]);

  // Fetch balance on component mount
  React.useEffect(() => {
    const fetchBalance = async () => {
      try {
        setBalanceLoading(true);
        const response = await fetch("/api/user/balance", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          console.error("Failed to fetch balance");
          setBalance(0);
          return;
        }

        const data = await response.json();
        setBalance(data.balance || 0);
      } catch (err) {
        console.error("Error fetching balance:", err);
        setBalance(0);
      } finally {
        setBalanceLoading(false);
      }
    };

    fetchBalance();
  }, []);

  // Fetch daily costs on component mount
  React.useEffect(() => {
    const fetchDailyCosts = async () => {
      try {
        setDailyCostLoading(true);
        const response = await fetch("/api/miners/daily-costs", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          console.error("Failed to fetch daily costs");
          setDailyCost(0);
          return;
        }

        const data = await response.json();
        setDailyCost(data.totalDailyCost || 0);
      } catch (err) {
        console.error("Error fetching daily costs:", err);
        setDailyCost(0);
      } finally {
        setDailyCostLoading(false);
      }
    };

    fetchDailyCosts();
  }, []);

  // Fetch workers stats on component mount
  React.useEffect(() => {
    const fetchWorkersStats = async () => {
      try {
        setWorkersLoading(true);
        setWorkersError(null);

        const response = await fetch("/api/workers/stats", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch workers stats");
        }

        if (data.success) {
          setWorkersStats({
            activeWorkers: data.data.activeWorkers || 0,
            inactiveWorkers: data.data.inactiveWorkers || 0,
            activePoolNames: data.data.activePoolNames || [],
            poolBreakdown: data.data.poolBreakdown,
          });
          // Reset chart mode if not applicable
          if (
            data.data.activePoolNames &&
            !data.data.activePoolNames.includes("Luxor") &&
            chartMode === "luxor"
          ) {
            setChartMode("total");
          }
          if (
            data.data.activePoolNames &&
            !data.data.activePoolNames.includes("Braiins") &&
            chartMode === "braiins"
          ) {
            setChartMode("total");
          }
        } else {
          throw new Error(data.error || "Failed to fetch workers");
        }
      } catch (err) {
        console.error("Error fetching workers stats:", err);
        setWorkersError(
          err instanceof Error ? err.message : "Failed to fetch workers",
        );
        setWorkersStats({
          activeWorkers: 0,
          inactiveWorkers: 0,
          activePoolNames: [],
        });
      } finally {
        setWorkersLoading(false);
      }
    };

    fetchWorkersStats();
  }, []);

  // Fetch miner summary counts on component mount
  React.useEffect(() => {
    const fetchMinersSummary = async () => {
      try {
        setMinersSummaryLoading(true);

        const response = await fetch("/api/miners/summary", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch miners summary");
        }

        if (data.success) {
          setMinersSummary({
            activePoolNames: data.data.activePoolNames || [],
            pools: {
              luxor: { miners: data.data.pools?.luxor?.miners || 0 },
              braiins: { miners: data.data.pools?.braiins?.miners || 0 },
            },
          });
        }
      } catch (err) {
        console.error("Error fetching miners summary:", err);
        setMinersSummary({
          activePoolNames: [],
          pools: {
            luxor: { miners: 0 },
            braiins: { miners: 0 },
          },
        });
      } finally {
        setMinersSummaryLoading(false);
      }
    };

    fetchMinersSummary();
  }, []);

  // ...existing code...
  const hosted = {
    runningCount: workersStats.activeWorkers,
    progress: 66,
    errorCount: workersStats.inactiveWorkers,
  };

  const showTotalMinersHeading =
    minersSummary.activePoolNames.includes("Luxor") &&
    minersSummary.activePoolNames.includes("Braiins");

  const combinedMinerCount =
    minersSummary.pools.luxor.miners + minersSummary.pools.braiins.miners;

  const marketplace = {
    runningCount: 0,
    comingSoon: true,
  };

  const handleRefreshWorkers = async () => {
    try {
      setWorkersLoading(true);
      setWorkersError(null);

      const response = await fetch("/api/workers/stats", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch workers stats");
      }

      const data = await response.json();

      if (data.success) {
        setWorkersStats({
          activeWorkers: data.data.activeWorkers || 0,
          inactiveWorkers: data.data.inactiveWorkers || 0,
          activePoolNames: data.data.activePoolNames || [],
          poolBreakdown: data.data.poolBreakdown,
        });
        // Reset chart mode if not applicable
        if (
          data.data.activePoolNames &&
          !data.data.activePoolNames.includes("Luxor") &&
          chartMode === "luxor"
        ) {
          setChartMode("total");
        }
        if (
          data.data.activePoolNames &&
          !data.data.activePoolNames.includes("Braiins") &&
          chartMode === "braiins"
        ) {
          setChartMode("total");
        }
      } else {
        throw new Error(data.error || "Failed to fetch workers");
      }
    } catch (err) {
      console.error("Error refreshing workers stats:", err);
      setWorkersError(
        err instanceof Error ? err.message : "Failed to refresh workers",
      );
    } finally {
      setWorkersLoading(false);
    }
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
    <Box component="main" sx={{ pt: { xs: 1, md: 2 }, pb: { xs: 3, md: 4 } }}>
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
              activePoolNames={workersStats.activePoolNames}
              poolBreakdown={workersStats.poolBreakdown}
              totalMinerCount={
                showTotalMinersHeading ? combinedMinerCount : undefined
              }
              loading={workersLoading}
              error={workersError}
              onRefresh={handleRefreshWorkers}
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

        {/* 4 gradient stat cards - 2-col on mobile, 4-col on desktop */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr 1fr" },
            gap: { xs: 1.5, sm: 2, md: 3 },
            mb: 2,
          }}
        >
          <BalanceCard value={balanceLoading ? 0 : balance} />
          <CostsCard value={dailyCostLoading ? 0 : dailyCost} />
          <EstimatedMiningDaysLeftCard days={daysLeft} />
          <EstimatedMonthlyCostCard value={estimatedMonthlyCost} />
        </Box>

        {/* Chart Section with Main Heading */}
        <Box sx={{ mt: { xs: 2.5, md: 4 } }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: { xs: "stretch", sm: "center" },
              mb: { xs: 1.5, sm: 2, md: 2.5 },
              gap: 1.5,
              flexDirection: { xs: "column", sm: "row" },
            }}
          >
            {/* Top row / Left on desktop: Title + Granularity Toggle */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 1.5,
              }}
            >
              <Typography
                variant="h5"
                fontWeight="bold"
                sx={{
                  color: theme.palette.text.primary,
                  fontSize: { xs: "1.2rem", sm: "1.45rem", md: "1.75rem" },
                  letterSpacing: "-0.02em",
                }}
              >
                Mining Performance
              </Typography>

              {/* Granularity toggle: Daily / Monthly */}
              <Box
                sx={{
                  display: "inline-flex",
                  p: 0.5,
                  borderRadius: 3,
                  backgroundColor:
                    theme.palette.mode === "dark"
                      ? "rgba(255, 255, 255, 0.06)"
                      : "rgba(0, 0, 0, 0.05)",
                  border: `1px solid ${
                    theme.palette.mode === "dark"
                      ? "rgba(255, 255, 255, 0.08)"
                      : "rgba(0, 0, 0, 0.06)"
                  }`,
                }}
              >
                {(["daily", "monthly"] as const).map((g) => {
                  const active = granularity === g;
                  return (
                    <Box
                      component="button"
                      key={g}
                      onClick={() => setGranularity(g)}
                      sx={{
                        px: { xs: 1.5, sm: 2 },
                        py: { xs: 0.6, sm: 0.75 },
                        borderRadius: 2.5,
                        border: "none",
                        cursor: "pointer",
                        fontSize: { xs: "0.75rem", sm: "0.8rem" },
                        fontWeight: active ? 700 : 500,
                        backgroundColor: active
                          ? "primary.main"
                          : "transparent",
                        color: active
                          ? "primary.contrastText"
                          : "text.secondary",
                        boxShadow: active
                          ? "0 2px 8px rgba(0, 198, 255, 0.35)"
                          : "none",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                        "&:hover": {
                          color: active
                            ? "primary.contrastText"
                            : "text.primary",
                        },
                      }}
                      title={
                        g === "daily"
                          ? "Show the last 31 days"
                          : "Show every fully-closed month"
                      }
                    >
                      {g === "daily" ? "Daily" : "Monthly"}
                    </Box>
                  );
                })}
              </Box>
            </Box>

            {/* Pool Selector Pills - Horizontal scrollable on mobile if needed */}
            {workersStats.activePoolNames.length > 1 && (
              <Box
                sx={{
                  display: "flex",
                  gap: 0.75,
                  overflowX: "auto",
                  pb: { xs: 0.5, sm: 0 },
                  scrollbarWidth: "none",
                  "&::-webkit-scrollbar": { display: "none" },
                  justifyContent: { xs: "flex-start", sm: "flex-end" },
                }}
              >
                <Box
                  component="button"
                  onClick={() => setChartMode("total")}
                  sx={{
                    px: { xs: 1.25, sm: 1.75 },
                    py: { xs: 0.6, sm: 0.75 },
                    borderRadius: 2.5,
                    border: "none",
                    cursor: "pointer",
                    fontSize: { xs: "0.75rem", sm: "0.8rem" },
                    fontWeight: chartMode === "total" ? 700 : 500,
                    whiteSpace: "nowrap",
                    backgroundColor:
                      chartMode === "total"
                        ? "primary.main"
                        : theme.palette.mode === "dark"
                          ? "rgba(255, 255, 255, 0.06)"
                          : "rgba(0, 0, 0, 0.05)",
                    color:
                      chartMode === "total"
                        ? "primary.contrastText"
                        : "text.secondary",
                    boxShadow:
                      chartMode === "total"
                        ? "0 2px 8px rgba(0, 198, 255, 0.35)"
                        : "none",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                  title="Show total earnings from all pools"
                >
                  All Pools
                </Box>

                {workersStats.activePoolNames.includes("Luxor") && (
                  <Box
                    component="button"
                    onClick={() => setChartMode("luxor")}
                    sx={{
                      px: { xs: 1.25, sm: 1.75 },
                      py: { xs: 0.6, sm: 0.75 },
                      borderRadius: 2.5,
                      border: "none",
                      cursor: "pointer",
                      fontSize: { xs: "0.75rem", sm: "0.8rem" },
                      fontWeight: chartMode === "luxor" ? 700 : 500,
                      whiteSpace: "nowrap",
                      backgroundColor:
                        chartMode === "luxor"
                          ? "#1565C0"
                          : theme.palette.mode === "dark"
                            ? "rgba(255, 255, 255, 0.06)"
                            : "rgba(0, 0, 0, 0.05)",
                      color:
                        chartMode === "luxor" ? "#FFFFFF" : "text.secondary",
                      boxShadow:
                        chartMode === "luxor"
                          ? "0 2px 8px rgba(21, 101, 192, 0.4)"
                          : "none",
                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                    title="Show Luxor pool earnings only"
                  >
                    🔷 Luxor
                  </Box>
                )}

                {workersStats.activePoolNames.includes("Braiins") && (
                  <Box
                    component="button"
                    onClick={() => setChartMode("braiins")}
                    sx={{
                      px: { xs: 1.25, sm: 1.75 },
                      py: { xs: 0.6, sm: 0.75 },
                      borderRadius: 2.5,
                      border: "none",
                      cursor: "pointer",
                      fontSize: { xs: "0.75rem", sm: "0.8rem" },
                      fontWeight: chartMode === "braiins" ? 700 : 500,
                      whiteSpace: "nowrap",
                      backgroundColor:
                        chartMode === "braiins"
                          ? "#FB8C00"
                          : theme.palette.mode === "dark"
                            ? "rgba(255, 255, 255, 0.06)"
                            : "rgba(0, 0, 0, 0.05)",
                      color:
                        chartMode === "braiins" ? "#FFFFFF" : "text.secondary",
                      boxShadow:
                        chartMode === "braiins"
                          ? "0 2px 8px rgba(251, 140, 0, 0.4)"
                          : "none",
                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                    title="Show Braiins pool earnings only"
                  >
                    🔶 Braiins
                  </Box>
                )}

                <Box
                  component="button"
                  onClick={() => setChartMode("sideBySide")}
                  sx={{
                    px: { xs: 1.25, sm: 1.75 },
                    py: { xs: 0.6, sm: 0.75 },
                    borderRadius: 2.5,
                    border: "none",
                    cursor: "pointer",
                    fontSize: { xs: "0.75rem", sm: "0.8rem" },
                    fontWeight: chartMode === "sideBySide" ? 700 : 500,
                    whiteSpace: "nowrap",
                    backgroundColor:
                      chartMode === "sideBySide"
                        ? "success.main"
                        : theme.palette.mode === "dark"
                          ? "rgba(255, 255, 255, 0.06)"
                          : "rgba(0, 0, 0, 0.05)",
                    color:
                      chartMode === "sideBySide"
                        ? "success.contrastText"
                        : "text.secondary",
                    boxShadow:
                      chartMode === "sideBySide"
                        ? "0 2px 8px rgba(0, 200, 83, 0.35)"
                        : "none",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                  title="Show side-by-side comparison of both pools"
                >
                  Side by Side
                </Box>
              </Box>
            )}
          </Box>

          <MiningEarningsChart
            height={isMobile ? 320 : 440}
            days={31}
            viewMode={chartMode}
            granularity={granularity}
          />
        </Box>
      </Container>
    </Box>
  );
}
