"use client";

import { Box, Typography } from "@mui/material";
import HostedMinersList from "@/components/HostedMinersList";
import BalanceCard from "@/components/dashboardCards/BalanceCard";
import CostsCard from "@/components/dashboardCards/CostsCard";
import EstimatedMonthlyCostCard from "@/components/dashboardCards/EstimatedMonthlyCostCard";
import EstimatedMiningDaysLeftCard from "@/components/dashboardCards/EstimatedMiningDaysLeftCard";
import React from "react";
import { formatValue } from "@/lib/helpers/formatValue";

export default function Miners() {
  const [balance, setBalance] = React.useState<number>(0);
  const [balanceLoading, setBalanceLoading] = React.useState(true);
  const [dailyCost, setDailyCost] = React.useState<number>(0);
  const [dailyCostLoading, setDailyCostLoading] = React.useState(true);

  const daysLeft = React.useMemo(() => {
    if (balanceLoading || dailyCostLoading) return 0;
    return Number(
      formatValue(balance / dailyCost, "number", { maximumFractionDigits: 0 }),
    );
  }, [balance, balanceLoading, dailyCost, dailyCostLoading]);

  const estimatedMonthlyCost = React.useMemo(() => {
    if (dailyCostLoading) return 0;
    return dailyCost * 30;
  }, [dailyCost, dailyCostLoading]);

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

      {/* Hosted Miners Summary Card */}
      {/* <Box sx={{ mb: 4 }}>
                <HostedMinersCard 
                    runningCount={5}
                    progress={75}
                    errorCount={2}
                    onAddMiner={() => {
                        console.log("Add miner clicked");
                        // Add your logic here to handle adding a new miner
                    }}
                />
            </Box> */}

      {/* Hosted Miners List */}
      <HostedMinersList />
    </Box>
  );
}
