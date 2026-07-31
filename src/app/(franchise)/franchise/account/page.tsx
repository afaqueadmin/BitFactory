"use client";

/**
 * Franchise "My Account" page — a franchisee's own personal mining summary
 * (balance, daily cost, hashrate/workers), independent of their customers.
 *
 * All 4 endpoints below scope by the caller's JWT userId, not by role, so
 * this page works unmodified for a FRANCHISEE the same way it does for a
 * CLIENT on the standard dashboard.
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

export default function FranchiseAccountPage() {
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

        {/* Top card */}
        <Box
          sx={{
            display: "flex",
            gap: 4,
            mb: 2,
            flexDirection: { xs: "column", md: "row" },
          }}
        >
          <Box sx={{ flex: 1 }}>
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
                console.log("ADD MINER clicked from FranchiseAccountPage");
              }}
            />
          </Box>
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
        <Box sx={{ mt: { xs: 2, md: 4 } }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              mb: { xs: 2, md: 3 },
              gap: { xs: 1, md: 2 },
              flexDirection: { xs: "column", sm: "row" },
            }}
          >
            <Typography
              variant="h4"
              fontWeight="bold"
              sx={{
                background: theme.palette.text.primary,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                fontSize: { xs: "1.25rem", sm: "1.6rem", md: "2rem" },
                textAlign: "left",
              }}
            >
              Daily Mining Performance
            </Typography>

            {/* Chart View Mode Toggle Buttons - Only show if multiple pools */}
            {workersStats.activePoolNames.length > 1 && (
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  flexWrap: "wrap",
                  justifyContent: { xs: "flex-start", sm: "flex-end" },
                }}
              >
                <button
                  onClick={() => setChartMode("total")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    fontWeight: chartMode === "total" ? 600 : 400,
                    backgroundColor:
                      chartMode === "total"
                        ? theme.palette.primary.main
                        : theme.palette.mode === "dark"
                          ? "rgba(255,255,255,0.1)"
                          : "rgba(0,0,0,0.05)",
                    color:
                      chartMode === "total"
                        ? theme.palette.primary.contrastText
                        : theme.palette.text.primary,
                    transition: "all 0.2s",
                  }}
                  title="Show total earnings from all pools"
                >
                  Total
                </button>

                {workersStats.activePoolNames.includes("Luxor") && (
                  <button
                    onClick={() => setChartMode("luxor")}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      fontWeight: chartMode === "luxor" ? 600 : 400,
                      backgroundColor:
                        chartMode === "luxor"
                          ? "#1565C0"
                          : theme.palette.mode === "dark"
                            ? "rgba(255,255,255,0.1)"
                            : "rgba(0,0,0,0.05)",
                      color:
                        chartMode === "luxor"
                          ? "#FFFFFF"
                          : theme.palette.text.primary,
                      transition: "all 0.2s",
                    }}
                    title="Show Luxor pool earnings only"
                  >
                    🔷 Luxor
                  </button>
                )}

                {workersStats.activePoolNames.includes("Braiins") && (
                  <button
                    onClick={() => setChartMode("braiins")}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      fontWeight: chartMode === "braiins" ? 600 : 400,
                      backgroundColor:
                        chartMode === "braiins"
                          ? "#FFA500"
                          : theme.palette.mode === "dark"
                            ? "rgba(255,255,255,0.1)"
                            : "rgba(0,0,0,0.05)",
                      color:
                        chartMode === "braiins"
                          ? "#FFFFFF"
                          : theme.palette.text.primary,
                      transition: "all 0.2s",
                    }}
                    title="Show Braiins pool earnings only"
                  >
                    🔶 Braiins
                  </button>
                )}

                <button
                  onClick={() => setChartMode("sideBySide")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    fontWeight: chartMode === "sideBySide" ? 600 : 400,
                    backgroundColor:
                      chartMode === "sideBySide"
                        ? theme.palette.success.main
                        : theme.palette.mode === "dark"
                          ? "rgba(255,255,255,0.1)"
                          : "rgba(0,0,0,0.05)",
                    color:
                      chartMode === "sideBySide"
                        ? theme.palette.success.contrastText
                        : theme.palette.text.primary,
                    transition: "all 0.2s",
                  }}
                  title="Show side-by-side comparison of both pools"
                >
                  Side by Side
                </button>
              </Box>
            )}
          </Box>

          <MiningEarningsChart
            height={isMobile ? 340 : 520}
            days={31}
            viewMode={chartMode}
          />
        </Box>
      </Container>
    </Box>
  );
}
