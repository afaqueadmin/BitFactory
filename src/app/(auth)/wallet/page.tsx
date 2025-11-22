"use client";

import React, { useEffect, useState } from "react";
import { Box, Typography, Paper } from "@mui/material";
import ElectricityCostTable from "@/components/ElectricityCostTable";
import { formatValue } from "@/lib/helpers/formatValue";

export default function WalletPage() {
  const [pendingPayoutsInUsd, setPendingPayoutsInUsd] = useState<string | null>(
    null,
  );
  const [totalEarningsInUsd, setTotalEarningsInUsd] = useState<string | null>(
    null,
  );
  console.log(process.env.NODE_ENV);
  useEffect(() => {
    // Function to fetch wallet data
    const fetchCurrentBtcPrice = async () => {
      try {
        const response = await fetch("/api/btcprice");

        if (!response.ok) {
          setTotalEarningsInUsd("Unavailable");
          setPendingPayoutsInUsd("Unavailable");
          return;
        }

        const data = await response.json();
        setPendingPayoutsInUsd(formatValue(1 * data.price, "currency")); // Example conversion, replace the 1 with actual user BTC amount
        setTotalEarningsInUsd(formatValue(2 * data.price, "currency")); // Example conversion, replace the 2 with actual user BTC amount
        // Update state with wallet data here
      } catch (error) {
        console.error("Error fetching BTC data:", error);
      }
    };

    // Call the API immediately on component mount
    fetchCurrentBtcPrice();
  }, []);

  return (
    <Box
      component="main"
      sx={{
        flexGrow: 1,
        p: 3,
        mt: 2,
        backgroundColor: (theme) =>
          theme.palette.mode === "light" ? "#f5f5f5" : theme.palette.grey[900],
        minHeight: "100vh",
      }}
    >
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        My Wallet
      </Typography>
      <Typography variant="body1" color="text.secondary" gutterBottom>
        Overview of your mining earnings and transactions.
      </Typography>

      <Box sx={{ display: "flex", gap: 3, mt: 2, flexWrap: "wrap" }}>
        <Box sx={{ flex: "1 1 300px", minWidth: "300px" }}>
          <Paper
            sx={{
              p: 3,
              borderRadius: 2,
              backgroundColor: (theme) =>
                theme.palette.mode === "light" ? "#2196f3" : "#1565c0",
              color: "white",
            }}
          >
            <Typography variant="subtitle1">Total Earnings</Typography>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography variant="h5" fontWeight="bold">
                ₿ 0.00
              </Typography>
              <Typography variant="h5" fontWeight="bold">
                {totalEarningsInUsd}
              </Typography>
            </Box>
          </Paper>
        </Box>

        <Box sx={{ flex: "1 1 300px", minWidth: "300px" }}>
          <Paper
            sx={{
              p: 3,
              borderRadius: 2,
              backgroundColor: (theme) =>
                theme.palette.mode === "light" ? "#4caf50" : "#2e7d32",
              color: "white",
            }}
          >
            <Typography variant="subtitle1">Pending Payouts</Typography>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography variant="h5" fontWeight="bold">
                ₿ 0.00
              </Typography>
              <Typography variant="h5" fontWeight="bold">
                {pendingPayoutsInUsd}
              </Typography>
            </Box>
          </Paper>
        </Box>
        <Box sx={{ flex: "1 1 300px", minWidth: "300px" }}>
          <Paper
            sx={{
              p: 3,
              borderRadius: 2,
              backgroundColor: (theme) =>
                theme.palette.mode === "light" ? "#ffb300" : "#ff8f00",
              color: "white",
            }}
          >
            <Typography variant="subtitle1">Wallet Address</Typography>
            <Typography variant="h6">0x1234...abcd</Typography>
          </Paper>
        </Box>
      </Box>

      {/* Electricity Cost Table */}
      <ElectricityCostTable />
    </Box>
  );
}
