"use client";

import { Box, Typography } from "@mui/material";
import HostedMinersList from "@/components/HostedMinersList";
import BalanceCard from "@/components/dashboardCards/BalanceCard";
import CostsCard from "@/components/dashboardCards/CostsCard";
import EstimatedMonthlyCostCard from "@/components/dashboardCards/EstimatedMonthlyCostCard";
import EstimatedMiningDaysLeftCard from "@/components/dashboardCards/EstimatedMiningDaysLeftCard";

export default function Miners() {
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
