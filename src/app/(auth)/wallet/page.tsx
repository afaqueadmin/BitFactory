"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Button,
  TextField,
  Alert,
  IconButton,
  Tooltip,
  useTheme,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import ElectricityCostTable from "@/components/ElectricityCostTable";
import ProfitLossChart from "@/components/ProfitLossChart";
import { useUser } from "@/lib/hooks/useUser";
import { LuxorPaymentSettings } from "@/lib/types/wallet";
import { useBitcoinLivePrice } from "@/components/useBitcoinLivePrice";
import { useWalletChangeRequests } from "@/lib/hooks/useWalletChangeRequests";
import RequestWalletChangeModal from "@/components/wallet/RequestWalletChangeModal";
import WalletChangeRequestHistory from "@/components/wallet/WalletChangeRequestHistory";

interface PoolBreakdown {
  totalEarnings: number;
  pendingPayouts: number;
}

interface EarningsSummary {
  totalEarnings: { btc: number; usd: number };
  pendingPayouts: { btc: number; usd: number };
  currency: string;
  dataSource: string;
  timestamp: string;
  subaccountCount: number;
  activePoolNames?: string[];
  poolBreakdown?: {
    luxor: PoolBreakdown;
    braiins: PoolBreakdown;
  };
}

interface Revenue24h {
  revenue24h: { btc: number; usd: number };
  currency: string;
  timestamp: string;
  dataSource: string;
  activePoolNames?: string[];
  poolBreakdown?: {
    luxor: { btc: number; usd: number };
    braiins: { btc: number; usd: number };
  };
}

export default function WalletPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [revenue24h, setRevenue24h] = useState<Revenue24h | null>(null);
  const [walletSettings, setWalletSettings] =
    useState<LuxorPaymentSettings | null>(null);
  const [poolMode, setPoolMode] = useState<"total" | "luxor" | "braiins">(
    "total",
  );
  const [activePoolNames, setActivePoolNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revenue24hLoading, setRevenue24hLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revenue24hError, setRevenue24hError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);

  // Statement download state
  const [statementStartDate, setStatementStartDate] = useState<string>("");
  const [statementEndDate, setStatementEndDate] = useState<string>("");
  const [statementError, setStatementError] = useState<string | null>(null);
  const [statementDownloading, setStatementDownloading] = useState(false);

  // Wallet change request state
  const [requestChangeOpen, setRequestChangeOpen] = useState(false);
  const { requests: walletChangeRequests } = useWalletChangeRequests({
    status: "PENDING",
  });
  const hasPendingWalletChange = walletChangeRequests.length > 0;

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
        setActivePoolNames(data.activePoolNames || []);
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
        setActivePoolNames(data.activePoolNames || []);
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

  // Auto-reset poolMode if selected pool is not in activePoolNames
  useEffect(() => {
    if (
      activePoolNames.length > 0 &&
      poolMode !== "total" &&
      !activePoolNames.includes(poolMode)
    ) {
      setPoolMode("total");
    }
  }, [activePoolNames]);

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

  // Helper functions to get values based on pool mode
  const getTotalEarnings = (): number => {
    if (!summary) return 0;
    if (poolMode === "total") return summary.totalEarnings.btc;
    if (poolMode === "luxor")
      return summary.poolBreakdown?.luxor.totalEarnings ?? 0;
    if (poolMode === "braiins")
      return summary.poolBreakdown?.braiins.totalEarnings ?? 0;
    return 0;
  };

  const getPendingPayouts = (): number => {
    if (!summary) return 0;
    if (poolMode === "total") return summary.pendingPayouts.btc;
    if (poolMode === "luxor")
      return summary.poolBreakdown?.luxor.pendingPayouts ?? 0;
    if (poolMode === "braiins")
      return summary.poolBreakdown?.braiins.pendingPayouts ?? 0;
    return 0;
  };

  const getRevenue24h = (): number => {
    if (!revenue24h) return 0;
    if (poolMode === "total") return revenue24h.revenue24h.btc;
    if (poolMode === "luxor") return revenue24h.poolBreakdown?.luxor.btc ?? 0;
    if (poolMode === "braiins")
      return revenue24h.poolBreakdown?.braiins.btc ?? 0;
    return 0;
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
  const btcPriceUsd = btcLiveData?.price
    ? typeof btcLiveData.price === "string"
      ? parseFloat(btcLiveData.price)
      : btcLiveData.price
    : null;

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

  const handleCopyAddress = () => {
    const address = getPrimaryWalletAddress();
    if (address && address !== "Not configured") {
      navigator.clipboard.writeText(address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  return (
    <Box
      component="main"
      sx={{
        flexGrow: 1,
        p: { xs: 1.5, sm: 2, md: 3 },
        mt: { xs: 1, md: 2 },
        backgroundColor: (theme) =>
          theme.palette.mode === "light" ? "#f8fafc" : theme.palette.grey[950],
        minHeight: "100vh",
      }}
    >
      {/* ── Page Header ────────────────────────────────────────────── */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "flex-start" },
          flexDirection: { xs: "column", sm: "row" },
          gap: { xs: 1.5, sm: 2 },
          mb: { xs: 2, md: 3 },
        }}
      >
        <Box>
          <Typography
            variant="h4"
            fontWeight="bold"
            sx={{
              fontSize: { xs: "1.45rem", sm: "1.85rem", md: "2.125rem" },
              letterSpacing: "-0.02em",
            }}
          >
            Wallet
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: { xs: "0.8rem", sm: "0.875rem" } }}
          >
            Overview of your mining earnings, payouts, and financial records.
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            gap: 1.25,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {activePoolNames.length > 1 && (
            <Box
              sx={{
                display: "inline-flex",
                p: 0.5,
                borderRadius: 3,
                backgroundColor: isDark
                  ? "rgba(255, 255, 255, 0.05)"
                  : "rgba(0, 0, 0, 0.04)",
                border: `1px solid ${
                  isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)"
                }`,
                gap: 0.5,
              }}
            >
              {[
                { key: "total", label: "Total" },
                ...(activePoolNames.includes("Luxor")
                  ? [{ key: "luxor", label: "🔷 Luxor" }]
                  : []),
                ...(activePoolNames.includes("Braiins")
                  ? [{ key: "braiins", label: "🔶 Braiins" }]
                  : []),
              ].map((item) => {
                const active = poolMode === item.key;
                return (
                  <Button
                    key={item.key}
                    size="small"
                    onClick={() =>
                      setPoolMode(item.key as "total" | "luxor" | "braiins")
                    }
                    sx={{
                      px: { xs: 1.25, sm: 1.75 },
                      py: { xs: 0.4, sm: 0.6 },
                      borderRadius: 2.5,
                      fontSize: { xs: "0.72rem", sm: "0.8rem" },
                      fontWeight: active ? 700 : 500,
                      textTransform: "none",
                      color: active
                        ? theme.palette.primary.contrastText
                        : theme.palette.text.secondary,
                      backgroundColor: active
                        ? theme.palette.primary.main
                        : "transparent",
                      boxShadow: active
                        ? "0 2px 8px rgba(0, 198, 255, 0.35)"
                        : "none",
                      "&:hover": {
                        backgroundColor: active
                          ? theme.palette.primary.dark
                          : isDark
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(0,0,0,0.04)",
                      },
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </Box>
          )}

          <Box sx={{ width: { xs: "100%", sm: "auto" } }}>
            {BtcLivePriceComponent}
          </Box>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <strong>Error loading earnings:</strong> {error}
        </Alert>
      )}

      {/* ── KPI Summary Cards ───────────────────────────────────────── */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            lg: "repeat(3, 1fr)",
          },
          gap: { xs: 1.5, sm: 2 },
          mt: 2,
        }}
      >
        {/* Card 1: Total Earnings */}
        <Paper
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: 3,
            background: isDark
              ? "linear-gradient(135deg, rgba(30, 58, 138, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)"
              : "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)",
            color: "white",
            border: `1px solid ${
              isDark ? "rgba(59, 130, 246, 0.3)" : "rgba(255,255,255,0.2)"
            }`,
            boxShadow: "0 4px 20px rgba(30, 64, 175, 0.15)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Typography
            variant="caption"
            sx={{
              opacity: 0.85,
              fontWeight: 600,
              fontSize: { xs: "0.75rem", sm: "0.82rem" },
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              display: "block",
            }}
          >
            Total Earnings{" "}
            {poolMode !== "total" && `(${poolMode.toUpperCase()})`}
          </Typography>

          {isLoading ? (
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5 }}
            >
              <CircularProgress size={18} sx={{ color: "white" }} />
              <Typography variant="body2">Loading...</Typography>
            </Box>
          ) : (
            <Box sx={{ mt: 1 }}>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: "1.35rem", sm: "1.65rem" },
                  letterSpacing: "-0.01em",
                }}
              >
                ₿ {getTotalEarnings().toFixed(8)}
              </Typography>
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: { xs: "0.95rem", sm: "1.05rem" },
                  opacity: 0.9,
                  mt: 0.25,
                }}
              >
                ≈ $
                {getTotalEarnings() && btcLiveData?.price
                  ? (getTotalEarnings() * btcLiveData.price).toLocaleString(
                      undefined,
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                    )
                  : "0.00"}
              </Typography>
            </Box>
          )}
        </Paper>

        {/* Card 2: Primary Wallet Address */}
        <Paper
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: 3,
            background: isDark
              ? "linear-gradient(135deg, rgba(120, 53, 15, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)"
              : "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)",
            color: "white",
            border: `1px solid ${
              isDark ? "rgba(245, 158, 11, 0.3)" : "rgba(255,255,255,0.2)"
            }`,
            boxShadow: "0 4px 20px rgba(217, 119, 6, 0.15)",
            opacity: poolMode === "braiins" ? 0.65 : 1,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                opacity: 0.85,
                fontWeight: 600,
                fontSize: { xs: "0.75rem", sm: "0.82rem" },
                letterSpacing: "0.03em",
                textTransform: "uppercase",
              }}
            >
              Primary Wallet Address
            </Typography>
            {getPrimaryWalletAddress() !== "Not configured" &&
              poolMode !== "braiins" && (
                <Tooltip title={copiedAddress ? "Copied!" : "Copy Address"}>
                  <IconButton
                    size="small"
                    onClick={handleCopyAddress}
                    sx={{
                      color: "white",
                      p: 0.5,
                      backgroundColor: "rgba(255,255,255,0.15)",
                      "&:hover": { backgroundColor: "rgba(255,255,255,0.25)" },
                    }}
                  >
                    {copiedAddress ? (
                      <CheckIcon sx={{ fontSize: 16 }} />
                    ) : (
                      <ContentCopyIcon sx={{ fontSize: 16 }} />
                    )}
                  </IconButton>
                </Tooltip>
              )}
          </Box>

          {poolMode === "braiins" ? (
            <Typography
              variant="body2"
              sx={{ mt: 1.5, fontFamily: "monospace", opacity: 0.9 }}
            >
              Not available for Braiins
            </Typography>
          ) : walletLoading ? (
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5 }}
            >
              <CircularProgress size={18} sx={{ color: "white" }} />
              <Typography variant="body2">Loading...</Typography>
            </Box>
          ) : walletError ? (
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              {walletError}
            </Typography>
          ) : (
            <>
              <Typography
                variant="body2"
                sx={{
                  wordBreak: "break-all",
                  mt: 1,
                  fontFamily: "monospace",
                  fontSize: { xs: "0.78rem", sm: "0.85rem" },
                  lineHeight: 1.4,
                  backgroundColor: "rgba(0,0,0,0.15)",
                  p: 0.75,
                  borderRadius: 1.5,
                }}
              >
                {getPrimaryWalletAddress()}
              </Typography>

              {hasPendingWalletChange ? (
                <Typography
                  variant="caption"
                  sx={{
                    mt: 1,
                    display: "inline-block",
                    backgroundColor: "rgba(255,255,255,0.2)",
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                    fontWeight: 600,
                  }}
                >
                  ⏳ Change pending review
                </Typography>
              ) : (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setRequestChangeOpen(true)}
                  sx={{
                    mt: 1,
                    color: "white",
                    borderColor: "rgba(255,255,255,0.5)",
                    borderRadius: 2,
                    fontSize: "0.72rem",
                    py: 0.3,
                    textTransform: "none",
                    fontWeight: 600,
                    "&:hover": {
                      borderColor: "white",
                      backgroundColor: "rgba(255,255,255,0.15)",
                    },
                  }}
                >
                  Request Change
                </Button>
              )}
            </>
          )}
        </Paper>

        {/* Card 3: Revenue (24 Hours) */}
        <Paper
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: 3,
            background: isDark
              ? "linear-gradient(135deg, rgba(88, 28, 135, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)"
              : "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
            color: "white",
            border: `1px solid ${
              isDark ? "rgba(168, 85, 247, 0.3)" : "rgba(255,255,255,0.2)"
            }`,
            boxShadow: "0 4px 20px rgba(124, 58, 237, 0.15)",
          }}
        >
          <Typography
            variant="caption"
            sx={{
              opacity: 0.85,
              fontWeight: 600,
              fontSize: { xs: "0.75rem", sm: "0.82rem" },
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              display: "block",
            }}
          >
            Revenue (24 Hours){" "}
            {poolMode !== "total" && `(${poolMode.toUpperCase()})`}
          </Typography>

          {revenue24hLoading ? (
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5 }}
            >
              <CircularProgress size={18} sx={{ color: "white" }} />
              <Typography variant="body2">Loading...</Typography>
            </Box>
          ) : revenue24hError ? (
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              {revenue24hError}
            </Typography>
          ) : (
            <Box sx={{ mt: 1 }}>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: "1.35rem", sm: "1.65rem" },
                  letterSpacing: "-0.01em",
                }}
              >
                ₿ {getRevenue24h().toFixed(8)}
              </Typography>
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: { xs: "0.95rem", sm: "1.05rem" },
                  opacity: 0.9,
                  mt: 0.25,
                }}
              >
                ≈ $
                {getRevenue24h() && btcLiveData?.price
                  ? (getRevenue24h() * btcLiveData.price).toLocaleString(
                      undefined,
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                    )
                  : "0.00"}
              </Typography>
            </Box>
          )}
        </Paper>

        {/* Card 4: Pending Payouts */}
        <Paper
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: 3,
            background: isDark
              ? "linear-gradient(135deg, rgba(6, 78, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)"
              : "linear-gradient(135deg, #059669 0%, #10b981 100%)",
            color: "white",
            border: `1px solid ${
              isDark ? "rgba(16, 185, 129, 0.3)" : "rgba(255,255,255,0.2)"
            }`,
            boxShadow: "0 4px 20px rgba(5, 150, 105, 0.15)",
          }}
        >
          <Typography
            variant="caption"
            sx={{
              opacity: 0.85,
              fontWeight: 600,
              fontSize: { xs: "0.75rem", sm: "0.82rem" },
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              display: "block",
            }}
          >
            Pending Payouts{" "}
            {poolMode !== "total" && `(${poolMode.toUpperCase()})`}
          </Typography>

          {isLoading ? (
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5 }}
            >
              <CircularProgress size={18} sx={{ color: "white" }} />
              <Typography variant="body2">Loading...</Typography>
            </Box>
          ) : (
            <Box sx={{ mt: 1 }}>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: "1.35rem", sm: "1.65rem" },
                  letterSpacing: "-0.01em",
                }}
              >
                ₿ {getPendingPayouts().toFixed(8)}
              </Typography>
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: { xs: "0.95rem", sm: "1.05rem" },
                  opacity: 0.9,
                  mt: 0.25,
                }}
              >
                ≈ $
                {getPendingPayouts() && btcLiveData?.price
                  ? (getPendingPayouts() * btcLiveData.price).toLocaleString(
                      undefined,
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                    )
                  : "0.00"}
              </Typography>
            </Box>
          )}
        </Paper>

        {/* Card 5: Payment Frequency */}
        <Paper
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: 3,
            background: isDark
              ? "linear-gradient(135deg, rgba(124, 45, 18, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)"
              : "linear-gradient(135deg, #ea580c 0%, #f97316 100%)",
            color: "white",
            border: `1px solid ${
              isDark ? "rgba(249, 115, 22, 0.3)" : "rgba(255,255,255,0.2)"
            }`,
            boxShadow: "0 4px 20px rgba(234, 88, 12, 0.15)",
            opacity: poolMode === "braiins" ? 0.65 : 1,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              opacity: 0.85,
              fontWeight: 600,
              fontSize: { xs: "0.75rem", sm: "0.82rem" },
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              display: "block",
            }}
          >
            Payment Frequency
          </Typography>

          {poolMode === "braiins" ? (
            <Typography
              variant="body2"
              sx={{ mt: 1.5, fontFamily: "monospace", opacity: 0.9 }}
            >
              Not available for Braiins
            </Typography>
          ) : walletLoading ? (
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5 }}
            >
              <CircularProgress size={18} sx={{ color: "white" }} />
              <Typography variant="body2">Loading...</Typography>
            </Box>
          ) : walletError ? (
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              Unable to load
            </Typography>
          ) : (
            <Box sx={{ mt: 1 }}>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: "1.25rem", sm: "1.45rem" },
                }}
              >
                {walletSettings?.payment_frequency
                  ? toProperCase(walletSettings.payment_frequency)
                  : "Not set"}
              </Typography>
              {walletSettings?.payment_frequency === "WEEKLY" &&
                walletSettings?.day_of_week && (
                  <Typography
                    variant="caption"
                    sx={{ mt: 0.5, opacity: 0.9, display: "block" }}
                  >
                    Every {toProperCase(walletSettings.day_of_week)}
                  </Typography>
                )}
            </Box>
          )}
        </Paper>

        {/* Card 6: Next Payout */}
        <Paper
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: 3,
            background: isDark
              ? "linear-gradient(135deg, rgba(19, 78, 74, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)"
              : "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
            color: "white",
            border: `1px solid ${
              isDark ? "rgba(20, 184, 166, 0.3)" : "rgba(255,255,255,0.2)"
            }`,
            boxShadow: "0 4px 20px rgba(13, 148, 136, 0.15)",
            opacity: poolMode === "braiins" ? 0.65 : 1,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              opacity: 0.85,
              fontWeight: 600,
              fontSize: { xs: "0.75rem", sm: "0.82rem" },
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              display: "block",
            }}
          >
            Next Payout
          </Typography>

          {poolMode === "braiins" ? (
            <Typography
              variant="body2"
              sx={{ mt: 1.5, fontFamily: "monospace", opacity: 0.9 }}
            >
              Not available for Braiins
            </Typography>
          ) : walletLoading ? (
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5 }}
            >
              <CircularProgress size={18} sx={{ color: "white" }} />
              <Typography variant="body2">Loading...</Typography>
            </Box>
          ) : walletError ? (
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              Unable to load
            </Typography>
          ) : walletSettings?.next_payout_at ? (
            <Box sx={{ mt: 1 }}>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: "1.1rem", sm: "1.3rem" },
                }}
              >
                {payoutDate.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Typography>
              <Typography
                variant="caption"
                sx={{ mt: 0.5, opacity: 0.9, display: "block" }}
              >
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
                  .find((part) => part.type === "timeZoneName")?.value || "GMT"}
                )
              </Typography>
            </Box>
          ) : (
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: { xs: "1.1rem", sm: "1.25rem" },
                mt: 1,
              }}
            >
              Not scheduled
            </Typography>
          )}
        </Paper>
      </Box>

      {/* Profit & Loss Overview */}
      <ProfitLossChart
        totalEarningsBtc={getTotalEarnings()}
        btcPriceUsd={btcPriceUsd}
      />

      {/* Statement Download Section */}
      <Box sx={{ width: "100%", mt: { xs: 2.5, md: 4 } }}>
        <Paper
          sx={{
            p: { xs: 2, sm: 3 },
            borderRadius: 3,
            backgroundColor: isDark
              ? "rgba(33, 150, 243, 0.06)"
              : "rgba(33, 150, 243, 0.04)",
            border: `1px solid ${
              isDark ? "rgba(33, 150, 243, 0.2)" : "rgba(33, 150, 243, 0.15)"
            }`,
            borderLeft: "4px solid #2196f3",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1 }}>
            <PictureAsPdfIcon sx={{ color: "primary.main", fontSize: 24 }} />
            <Typography
              variant="h6"
              fontWeight="700"
              sx={{ fontSize: { xs: "1rem", sm: "1.15rem" } }}
            >
              Download Account Statement
            </Typography>
          </Box>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2, fontSize: { xs: "0.8rem", sm: "0.875rem" } }}
          >
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
              gap: 1.5,
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
              slotProps={{ inputLabel: { shrink: true } }}
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
              slotProps={{ inputLabel: { shrink: true } }}
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
              fullWidth
              sx={{
                whiteSpace: "nowrap",
                borderRadius: 2,
                py: { xs: 1, sm: 0.9 },
                fontWeight: 600,
                textTransform: "none",
                boxShadow: "0 2px 8px rgba(0,198,255,0.3)",
              }}
            >
              {statementDownloading ? (
                <>
                  <CircularProgress size={18} sx={{ mr: 1, color: "white" }} />
                  Generating PDF...
                </>
              ) : (
                "Download PDF"
              )}
            </Button>
          </Box>
        </Paper>
      </Box>

      {/* Wallet Change Requests */}
      <Box sx={{ width: "100%", mt: { xs: 2.5, md: 4 } }}>
        <Typography
          variant="h6"
          fontWeight="700"
          sx={{ mb: 1.5, fontSize: { xs: "1rem", sm: "1.2rem" } }}
        >
          Wallet Change Requests
        </Typography>
        <WalletChangeRequestHistory />
      </Box>

      <RequestWalletChangeModal
        open={requestChangeOpen}
        onClose={() => setRequestChangeOpen(false)}
        currentAddress={getPrimaryWalletAddress()}
      />

      {/* Electricity Cost Table */}
      <ElectricityCostTable />
    </Box>
  );
}
