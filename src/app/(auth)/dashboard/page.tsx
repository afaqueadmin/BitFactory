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
import { formatValue } from "@/lib/helpers/formatValue";
import { getDaysInCurrentMonth } from "@/lib/helpers/getDaysInCurrentMonth";

export default function DashboardPage() {
  const { loading, error } = useUser();
  const theme = useTheme();
  const [balance, setBalance] = React.useState<number>(0);
  const [balanceLoading, setBalanceLoading] = React.useState(true);
  const [dailyCost, setDailyCost] = React.useState<number>(0);
  const [dailyCostLoading, setDailyCostLoading] = React.useState(true);

  // Workers stats state
  const [workersStats, setWorkersStats] = React.useState({
    activeWorkers: 0,
    inactiveWorkers: 0,
  });
  const [workersLoading, setWorkersLoading] = React.useState(true);
  const [workersError, setWorkersError] = React.useState<string | null>(null);

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

        if (!response.ok) {
          throw new Error("Failed to fetch workers stats");
        }

        const data = await response.json();

        if (data.success) {
          setWorkersStats({
            activeWorkers: data.data.activeWorkers || 0,
            inactiveWorkers: data.data.inactiveWorkers || 0,
          });
        } else {
          throw new Error(data.error || "Failed to fetch workers");
        }
      } catch (err) {
        console.error("Error fetching workers stats:", err);
        setWorkersError(
          err instanceof Error ? err.message : "Failed to fetch workers",
        );
        setWorkersStats({ activeWorkers: 0, inactiveWorkers: 0 });
      } finally {
        setWorkersLoading(false);
      }
    };

    fetchWorkersStats();
  }, []);

  // ...existing code...
  const hosted = {
    runningCount: workersStats.activeWorkers,
    progress: 66,
    errorCount: workersStats.inactiveWorkers,
  };

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
        });
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
            <BalanceCard value={balanceLoading ? 0 : balance} />
          </Box>

          <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
            <CostsCard value={dailyCostLoading ? 0 : dailyCost} />
          </Box>

          <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
            <EstimatedMiningDaysLeftCard days={daysLeft} />
          </Box>

          <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
            <EstimatedMonthlyCostCard value={estimatedMonthlyCost} />
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

          <MiningEarningsChart
            title="Daily Mining Performance"
            height={400}
            days={31}
          />
        </Box>
      </Container>
    </Box>
  );
}
