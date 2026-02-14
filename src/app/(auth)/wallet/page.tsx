"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  useTheme,
  Button,
  TextField,
  Alert,
} from "@mui/material";
import ElectricityCostTable from "@/components/ElectricityCostTable";
import { useUser } from "@/lib/hooks/useUser";
import { LuxorPaymentSettings } from "@/lib/types/wallet";
import { useBitcoinLivePrice } from "@/components/useBitcoinLivePrice";

interface EarningsSummary {
  totalEarnings: { btc: number; usd: number };
  pendingPayouts: { btc: number; usd: number };
  currency: string;
  dataSource: string;
  timestamp: string;
  subaccountCount: number;
}

interface Revenue24h {
  revenue24h: { btc: number; usd: number };
  currency: string;
  timestamp: string;
  dataSource: string;
}

export default function WalletPage() {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [revenue24h, setRevenue24h] = useState<Revenue24h | null>(null);
  const [walletSettings, setWalletSettings] =
    useState<LuxorPaymentSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [revenue24hLoading, setRevenue24hLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revenue24hError, setRevenue24hError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  // Statement download state
  const [statementStartDate, setStatementStartDate] = useState<string>("");
  const [statementEndDate, setStatementEndDate] = useState<string>("");
  const [statementError, setStatementError] = useState<string | null>(null);
  const [statementDownloading, setStatementDownloading] = useState(false);

  const { user } = useUser();
  // const theme = useTheme();

  // // Fetch BTC price using TanStack Query
  // const { data: btcLiveData, isLoading: btcPriceLoading, error: btcPriceError } = useQuery<BtcPrice>({
  //   queryKey: ["btcprice"],
  //   queryFn: async () => {
  //     // const response = await fetch("/api/btcprice");
  //     const response = await fetch(
  //   "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
  //     );
  //     if (!response.ok) {
  //       throw new Error("Failed to fetch BTC price");
  //     }
  //     return response.json();
  //   },
  //   staleTime: 1000 * 60 * 5, // 5 minutes
  //   refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes. Enable this to fetch live data periodically
  // });
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

  // Fetch 24-hour revenue from API
  useEffect(() => {
    const fetchRevenue24h = async () => {
      try {
        setRevenue24hLoading(true);
        setRevenue24hError(null);

        const response = await fetch("/api/wallet/earnings-24h");

        if (!response.ok) {
          throw new Error(
            `Failed to fetch 24h revenue: ${response.statusText}`,
          );
        }

        const data: Revenue24h = await response.json();
        setRevenue24h(data);
        console.log("[Wallet] 24h revenue loaded:", data);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[Wallet] Error fetching 24h revenue:", error);
        setRevenue24hError(errorMessage);
      } finally {
        setRevenue24hLoading(false);
      }
    };

    // Call the API immediately on component mount
    fetchRevenue24h();
  }, []);

  // Fetch wallet settings from Luxor API
  useEffect(() => {
    const fetchWalletSettings = async () => {
      try {
        setWalletLoading(true);
        setWalletError(null);

        const response = await fetch("/api/wallet/settings?currency=BTC", {
          credentials: "include",
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error ||
              `Failed to fetch wallet settings: ${response.statusText}`,
          );
        }

        const data = await response.json();
        if (data.success && data.data) {
          setWalletSettings(data.data);
          console.log("[Wallet] Settings loaded from Luxor:", data.data);
        } else {
          throw new Error(
            data.error || "Invalid response from wallet settings endpoint",
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[Wallet] Error fetching wallet settings:", error);
        setWalletError(errorMessage);
      } finally {
        setWalletLoading(false);
      }
    };

    if (user?.id) {
      fetchWalletSettings();
    }
  }, [user?.id]);

  const getPrimaryWalletAddress = (): string => {
    if (!walletSettings?.addresses || walletSettings.addresses.length === 0) {
      return "Not configured";
    }

    // Find primary address (highest revenue allocation or first one)
    const primary = walletSettings.addresses.reduce((prev, current) =>
      current.revenue_allocation > prev.revenue_allocation ? current : prev,
    );

    return primary.external_address;
  };

  const toProperCase = (text: string): string => {
    if (!text) return "";
    return text
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  let payoutDate = new Date();
  let twoHoursLaterPayoutDate = new Date();
  if (walletSettings?.next_payout_at !== undefined) {
    payoutDate = new Date(walletSettings.next_payout_at);
    twoHoursLaterPayoutDate = new Date(
      payoutDate.getTime() + 2 * 60 * 60 * 1000,
    );
  }

  const { btcLiveData, BtcLivePriceComponent } = useBitcoinLivePrice();
  const minCardHeight = 140;

  // Handle statement download
  const handleDownloadStatement = async () => {
    try {
      setStatementError(null);

      // Validate dates
      if (!statementStartDate || !statementEndDate) {
        setStatementError("Both start and end dates are required");
        return;
      }

      const startDate = new Date(statementStartDate);
      const endDate = new Date(statementEndDate);

      if (startDate > endDate) {
        setStatementError("Start date must be before end date");
        return;
      }

      // Check 12-month limit
      const monthsDiff =
        (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth());

      if (monthsDiff > 12) {
        setStatementError("Date range cannot exceed 12 months");
        return;
      }

      setStatementDownloading(true);

      const params = new URLSearchParams({
        startDate: statementStartDate,
        endDate: statementEndDate,
      });

      const response = await fetch(`/api/wallet/statement?${params}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate statement");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const startFormatted = statementStartDate.split("-").reverse().join("-");
      const endFormatted = statementEndDate.split("-").reverse().join("-");
      a.download = `account-statement-${startFormatted}-to-${endFormatted}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to download statement";
      setStatementError(errorMessage);
      console.error("Statement download error:", error);
    } finally {
      setStatementDownloading(false);
    }
  };

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
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Wallet
          </Typography>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            Overview of your mining earnings and transactions.
          </Typography>
        </Box>
        {BtcLivePriceComponent}
      </Box>

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

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 3,
          mt: 2,
        }}
      >
        {/* Top Row: Total Earnings & Primary Wallet Address */}
        <Box>
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
                  $
                  {summary?.totalEarnings.btc && btcLiveData?.price
                    ? (summary.totalEarnings.btc * btcLiveData.price).toFixed(2)
                    : "0.00"}
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>

        <Box>
          <Paper
            sx={{
              p: 3,
              borderRadius: 2,
              backgroundColor: (theme) =>
                theme.palette.mode === "light" ? "#ffb300" : "#ff8f00",
              color: "white",
            }}
          >
            <Typography variant="subtitle1">Primary Wallet Address</Typography>
            {walletLoading ? (
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}
              >
                <CircularProgress size={20} sx={{ color: "white" }} />
                <Typography variant="body2">Loading...</Typography>
              </Box>
            ) : walletError ? (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {walletError}
              </Typography>
            ) : (
              <Typography
                variant="body2"
                sx={{
                  wordBreak: "break-all",
                  mt: 1,
                  fontFamily: "monospace",
                  fontSize: "0.9rem",
                }}
              >
                {getPrimaryWalletAddress()}
              </Typography>
            )}
          </Paper>
        </Box>

        {/* Bottom Row: Revenue (24 hours) & Pending Payouts */}
        <Box>
          <Paper
            sx={{
              p: 3,
              borderRadius: 2,
              backgroundColor: (theme) =>
                theme.palette.mode === "light" ? "#9c27b0" : "#6a1b9a",
              color: "white",
            }}
          >
            <Typography variant="subtitle1">Revenue (24 Hours)</Typography>
            {revenue24hLoading ? (
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}
              >
                <CircularProgress size={24} sx={{ color: "white" }} />
                <Typography variant="body2">Loading...</Typography>
              </Box>
            ) : revenue24hError ? (
              <Typography variant="body2" sx={{ mt: 1, fontSize: "0.9rem" }}>
                {revenue24hError}
              </Typography>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Typography variant="h5" fontWeight="bold">
                  ₿ {revenue24h?.revenue24h.btc.toFixed(8) ?? "0.00"}
                </Typography>
                <Typography variant="h5" fontWeight="bold">
                  $
                  {revenue24h?.revenue24h.btc && btcLiveData?.price
                    ? (revenue24h?.revenue24h.btc * btcLiveData.price).toFixed(
                        2,
                      )
                    : "0.00"}
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>

        <Box>
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
                  $
                  {summary?.pendingPayouts.btc && btcLiveData?.price
                    ? (summary?.pendingPayouts.btc * btcLiveData.price).toFixed(
                        2,
                      )
                    : "0.00"}
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>

        {/* Third Row: Payment Frequency & Next Payout */}
        <Box>
          <Paper
            sx={{
              p: 3,
              borderRadius: 2,
              backgroundColor: (theme) =>
                theme.palette.mode === "light" ? "#ff6f00" : "#e65100",
              color: "white",
              minHeight: minCardHeight,
            }}
          >
            <Typography variant="subtitle1">Payment Frequency</Typography>
            {walletLoading ? (
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}
              >
                <CircularProgress size={24} sx={{ color: "white" }} />
                <Typography variant="body2">Loading...</Typography>
              </Box>
            ) : walletError ? (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Unable to load
              </Typography>
            ) : (
              <Typography variant="h5" fontWeight="bold" sx={{ mt: 1 }}>
                {walletSettings?.payment_frequency
                  ? toProperCase(walletSettings.payment_frequency)
                  : "Not set"}
              </Typography>
            )}
            {walletSettings?.payment_frequency === "WEEKLY" &&
              walletSettings?.day_of_week && (
                <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                  Every {toProperCase(walletSettings.day_of_week)}
                </Typography>
              )}
          </Paper>
        </Box>

        <Box>
          <Paper
            sx={{
              p: 3,
              borderRadius: 2,
              backgroundColor: (theme) =>
                theme.palette.mode === "light" ? "#00796b" : "#004d40",
              color: "white",
              minHeight: minCardHeight,
            }}
          >
            <Typography variant="subtitle1">Next Payout</Typography>
            {walletLoading ? (
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}
              >
                <CircularProgress size={24} sx={{ color: "white" }} />
                <Typography variant="body2">Loading...</Typography>
              </Box>
            ) : walletError ? (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Unable to load
              </Typography>
            ) : walletSettings?.next_payout_at ? (
              <Box sx={{ mt: 1 }}>
                <Typography variant="h6" fontWeight="bold">
                  {payoutDate.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.9 }}>
                  {payoutDate.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  -{" "}
                  {twoHoursLaterPayoutDate.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  (
                  {new Intl.DateTimeFormat("en-US", {
                    timeZoneName: "shortOffset",
                  })
                    .formatToParts(payoutDate)
                    .find((part) => part.type === "timeZoneName")?.value ||
                    "GMT"}
                  )
                </Typography>
              </Box>
            ) : (
              <Typography variant="h6" fontWeight="bold" sx={{ mt: 1 }}>
                Not scheduled
              </Typography>
            )}
          </Paper>
        </Box>
      </Box>

      {/* Statement Download Section */}
      <Box sx={{ width: "100%", mt: 4 }}>
        <Paper
          sx={{
            p: 3,
            borderRadius: 2,
            backgroundColor: (theme) =>
              theme.palette.mode === "light"
                ? "rgba(33, 150, 243, 0.05)"
                : "rgba(33, 150, 243, 0.1)",
            borderLeft: "4px solid #2196f3",
          }}
        >
          <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
            Download Account Statement
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select a date range (max 12 months) to generate and download your
            account statement as PDF.
          </Typography>

          {statementError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {statementError}
            </Alert>
          )}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr auto" },
              gap: 2,
              alignItems: "flex-end",
            }}
          >
            <TextField
              label="Start Date"
              type="date"
              value={statementStartDate}
              onChange={(e) => {
                setStatementStartDate(e.target.value);
                setStatementError(null);
              }}
              InputLabelProps={{
                shrink: true,
              }}
              inputProps={{
                max: new Date().toISOString().split("T")[0],
              }}
              fullWidth
              size="small"
            />
            <TextField
              label="End Date"
              type="date"
              value={statementEndDate}
              onChange={(e) => {
                setStatementEndDate(e.target.value);
                setStatementError(null);
              }}
              InputLabelProps={{
                shrink: true,
              }}
              inputProps={{
                max: new Date().toISOString().split("T")[0],
              }}
              fullWidth
              size="small"
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleDownloadStatement}
              disabled={
                statementDownloading || !statementStartDate || !statementEndDate
              }
              sx={{ whiteSpace: "nowrap", minWidth: "150px" }}
            >
              {statementDownloading ? (
                <>
                  <CircularProgress size={18} sx={{ mr: 1 }} />
                  Generating...
                </>
              ) : (
                "Download PDF"
              )}
            </Button>
          </Box>
        </Paper>
      </Box>

      {/* Transaction History */}
      {/* TODO: Enable Transaction History from Luxor API in the future */}
      {/* <TransactionHistory limit={50} /> */}

      {/* Electricity Cost Table */}
      <ElectricityCostTable />
    </Box>
  );
}
