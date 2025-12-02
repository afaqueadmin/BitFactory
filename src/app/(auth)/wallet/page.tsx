"use client";

import React, { useEffect, useState } from "react";
import { Box, Typography, Paper, CircularProgress } from "@mui/material";
import ElectricityCostTable from "@/components/ElectricityCostTable";
import TransactionHistory from "@/components/TransactionHistory";
import { formatValue } from "@/lib/helpers/formatValue";
import { useUser } from "@/lib/hooks/useUser";

interface EarningsSummary {
  totalEarnings: { btc: number; usd: number };
  pendingPayouts: { btc: number; usd: number };
  currency: string;
  dataSource: string;
  timestamp: string;
  subaccountCount: number;
}

export default function WalletPage() {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useUser();

  useEffect(() => {
    // Fetch earnings summary from API
    const fetchEarningsSummary = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/wallet/earnings-summary");

        if (!response.ok) {
          throw new Error(
            `Failed to fetch earnings summary: ${response.statusText}`,
          );
        }

        const data: EarningsSummary = await response.json();
        setSummary(data);
        console.log("[Wallet] Earnings summary loaded:", data);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[Wallet] Error fetching earnings summary:", error);
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    // Call the API immediately on component mount
    fetchEarningsSummary();
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

      {error && (
        <Paper
          sx={{
            p: 2,
            mt: 2,
            backgroundColor: "#ffebee",
            borderLeft: "4px solid #d32f2f",
            color: "#d32f2f",
          }}
        >
          <Typography variant="body2">
            <strong>Error loading earnings:</strong> {error}
          </Typography>
        </Paper>
      )}

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
            {isLoading ? (
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}
              >
                <CircularProgress size={24} sx={{ color: "white" }} />
                <Typography variant="body2">Loading...</Typography>
              </Box>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Typography variant="h5" fontWeight="bold">
                  ₿ {summary?.totalEarnings.btc.toFixed(8) ?? "0.00"}
                </Typography>
                <Typography variant="h5" fontWeight="bold">
                  ${summary?.totalEarnings.usd.toFixed(2) ?? "0.00"}
                </Typography>
              </Box>
            )}
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
            {isLoading ? (
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}
              >
                <CircularProgress size={24} sx={{ color: "white" }} />
                <Typography variant="body2">Loading...</Typography>
              </Box>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Typography variant="h5" fontWeight="bold">
                  ₿ {summary?.pendingPayouts.btc.toFixed(8) ?? "0.00"}
                </Typography>
                <Typography variant="h5" fontWeight="bold">
                  ${summary?.pendingPayouts.usd.toFixed(2) ?? "0.00"}
                </Typography>
              </Box>
            )}
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
            <Typography variant="h6">
              {user?.walletAddress ?? <b>Not set</b>}
            </Typography>
          </Paper>
        </Box>
      </Box>

      {/* Transaction History */}
      <TransactionHistory limit={50} />

      {/* Electricity Cost Table */}
      <ElectricityCostTable />
    </Box>
  );
}
