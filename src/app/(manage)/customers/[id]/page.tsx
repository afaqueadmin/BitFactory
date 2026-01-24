"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Button,
} from "@mui/material";
import { ArrowBack as ArrowBackIcon } from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import ElectricityCostTable from "@/components/ElectricityCostTable";
import HostedMinersList from "@/components/HostedMinersList";
import BalanceCard from "@/components/dashboardCards/BalanceCard";
import CostsCard from "@/components/dashboardCards/CostsCard";
import EstimatedMiningDaysLeftCard from "@/components/dashboardCards/EstimatedMiningDaysLeftCard";
import EstimatedMonthlyCostCard from "@/components/dashboardCards/EstimatedMonthlyCostCard";
import { getDaysInCurrentMonth } from "@/lib/helpers/getDaysInCurrentMonth";
import { formatValue } from "@/lib/helpers/formatValue";
import { LuxorPaymentSettings } from "@/lib/types/wallet";
import { useBitcoinLivePrice } from "@/components/useBitcoinLivePrice";

interface CustomerDetails {
  id: string;
  name: string;
  email: string;
  role: string;
  city: string;
  country: string;
  phoneNumber: string;
  companyName: string;
  luxorSubaccountName: string;
  streetAddress: string;
  twoFactorEnabled: boolean;
  joinDate: string;
  isDeleted: boolean;
  miners: number;
  status: "active" | "inactive";
}

interface EarningsSummary {
  totalEarnings: { btc: number; usd: number };
  pendingPayouts: { btc: number; usd: number };
  currentBalance: { btc: number; usd: number };
  currency: string;
  dataSource: string;
  timestamp: string;
}

// interface BalanceCardProps {
//   title: string;
//   btcValue: number;
//   usdValue: number;
//   isLoading: boolean;
//   error: string | null;
//   color: string;
// }
//
// const BalanceCard: React.FC<BalanceCardProps> = ({
//   title,
//   btcValue,
//   usdValue,
//   isLoading,
//   error,
//   color,
// }) => {
//   return (
//     <Paper
//       sx={{
//         p: 3,
//         borderRadius: 2,
//         backgroundColor: color,
//         color: "white",
//       }}
//     >
//         <Typography variant="subtitle1">{title}</Typography>
//         {isLoading ? (
//           <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
//             <CircularProgress size={24} sx={{ color: "white" }} />
//             <Typography variant="body2">Loading...</Typography>
//           </Box>
//         ) : error ? (
//           <Typography variant="body2" sx={{ mt: 1 }}>
//             {error}
//           </Typography>
//         ) : (
//           <Box
//             sx={{
//               display: "flex",
//               justifyContent: "space-between",
//               alignItems: "center",
//             }}
//           >
//             <Typography variant="h5" fontWeight="bold">
//               ₿ {btcValue.toFixed(8)}
//             </Typography>
//             <Typography variant="h5" fontWeight="bold">
//               ${usdValue.toFixed(2)}
//             </Typography>
//           </Box>
//         )}
//       </Paper>
//   );
// };

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  // Fetch customer details
  const {
    data: customer,
    isLoading: customerLoading,
    error: customerError,
  } = useQuery<CustomerDetails>({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      try {
        const response = await fetch(
          `/api/user/profile?customerId=${customerId}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch customer details");
        }

        const { user } = await response.json();
        console.log(user);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          city: user.city || "",
          country: user.country || "",
          phoneNumber: user.phoneNumber || "",
          companyName: user.companyName || "",
          luxorSubaccountName: user.luxorSubaccountName || "",
          streetAddress: user.streetAddress || "",
          twoFactorEnabled: user.twoFactorEnabled || false,
          joinDate: user.joinDate || "",
          miners: user.miners || 0,
          status: user.status || "active",
          isDeleted: user.isDeleted,
        };
      } catch (error) {
        throw error instanceof Error ? error : new Error("Unknown error");
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!customerId,
  });

  // Fetch balance
  const { data: balanceData, isLoading: balanceLoading } = useQuery<{
    balance: number;
  }>({
    queryKey: ["balance", customerId],
    queryFn: async () => {
      try {
        const response = await fetch(
          `/api/user/balance?customerId=${customerId}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (!response.ok) {
          throw new Error("Failed to fetch balance");
        }

        const data = await response.json();
        return { balance: data.balance || 0 };
      } catch (error) {
        console.error("Error fetching balance:", error);
        return { balance: 0 };
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!customerId,
  });

  // Fetch daily costs
  const { data: dailyCostsData, isLoading: dailyCostLoading } = useQuery<{
    totalDailyCost: number;
  }>({
    queryKey: ["dailyCosts", customerId],
    queryFn: async () => {
      try {
        const response = await fetch(
          `/api/miners/daily-costs?customerId=${customerId}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (!response.ok) {
          throw new Error("Failed to fetch daily costs");
        }

        const data = await response.json();
        return { totalDailyCost: data.totalDailyCost || 0 };
      } catch (err) {
        console.error("Error fetching daily costs:", err);
        return { totalDailyCost: 0 };
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!customerId,
  });

  // Fetch earnings summary
  const {
    data: summary,
    isLoading,
    error,
  } = useQuery<EarningsSummary>({
    queryKey: ["earningsSummary", customerId],
    queryFn: async () => {
      try {
        const response = await fetch(
          `/api/wallet/earnings-summary?customerId=${customerId}`,
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch earnings summary: ${response.statusText}`,
          );
        }

        const data: EarningsSummary = await response.json();
        console.log("[Wallet] Earnings summary loaded:", data);
        return data;
      } catch (error) {
        throw error instanceof Error ? error : new Error("Unknown error");
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!customerId,
  });

  // Fetch wallet settings
  const {
    data: walletSettings,
    isLoading: walletLoading,
    error: walletError,
  } = useQuery<LuxorPaymentSettings>({
    queryKey: ["walletSettings", customerId],
    queryFn: async () => {
      try {
        const response = await fetch(
          `/api/wallet/settings?currency=BTC&customerId=${customerId}`,
          {
            credentials: "include",
            headers: {
              "Cache-Control": "no-cache",
            },
          },
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error ||
              `Failed to fetch wallet settings: ${response.statusText}`,
          );
        }

        const data = await response.json();
        if (data.success && data.data) {
          console.log("[Wallet] Settings loaded from Luxor:", data.data);
          return data.data;
        } else {
          throw new Error(
            data.error || "Invalid response from wallet settings endpoint",
          );
        }
      } catch (error) {
        throw error instanceof Error ? error : new Error("Unknown error");
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!customerId,
  });

  const balance = balanceData?.balance || 0;
  const dailyCost = dailyCostsData?.totalDailyCost || 0;

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

  const toProperCase = (text: string): string => {
    if (!text) return "";
    return text
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const { btcLiveData, BtcLivePriceComponent } = useBitcoinLivePrice();
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
      {/* Back Button */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.back()}
        sx={{ mb: 2 }}
      >
        Back
      </Button>

      {customerLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : customerError || !customer ? (
        <Alert severity="error">
          {customerError?.message || "Failed to load customer details"}
        </Alert>
      ) : (
        <>
          {/* Customer Header */}
          <Box
            sx={{
              mb: 3,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="h4" fontWeight="bold">
                  {customer.name}
                </Typography>
                {customer.isDeleted && (
                  <Typography
                    variant="h4"
                    fontWeight="bold"
                    sx={{ color: "#d32f2f" }}
                  >
                    (Deleted)
                  </Typography>
                )}
              </Box>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                {customer.email} • {customer.role}
              </Typography>
              {customer.companyName && (
                <Typography variant="body2" color="text.secondary">
                  Company: {customer.companyName}
                </Typography>
              )}
            </Box>
            {BtcLivePriceComponent}
          </Box>

          {error && (
            <Paper
              sx={{
                p: 2,
                mt: 2,
                mb: 3,
                backgroundColor: "#ffebee",
                borderLeft: "4px solid #d32f2f",
                color: "#d32f2f",
              }}
            >
              <Typography variant="body2">
                <strong>Error loading earnings:</strong>{" "}
                {error?.message || "An error occurred"}
              </Typography>
            </Paper>
          )}

          {/* Balance Cards */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
              gap: 3,
              mb: 4,
            }}
          >
            <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
              <BalanceCard value={balanceLoading ? 0 : balance} />
            </Box>
            <Box>
              <Paper
                sx={{
                  p: 3,
                  borderRadius: 2,
                  backgroundColor: (theme) =>
                    theme.palette.mode === "light" ? "#2196f3" : "#1565c0",
                  color: "white",
                  minHeight: 120,
                }}
              >
                <Typography
                  variant="subtitle1"
                  sx={{
                    mb: 2,
                  }}
                >
                  Total Earnings
                </Typography>
                {isLoading ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mt: 1,
                    }}
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
                        ? (
                            summary.totalEarnings.btc * btcLiveData.price
                          ).toFixed(2)
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
                  minHeight: 120,
                }}
              >
                <Typography
                  variant="subtitle1"
                  sx={{
                    mb: 2,
                  }}
                >
                  Pending Payouts
                </Typography>
                {isLoading ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mt: 1,
                    }}
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
                        ? (
                            summary?.pendingPayouts.btc * btcLiveData.price
                          ).toFixed(2)
                        : "0.00"}
                    </Typography>
                  </Box>
                )}
              </Paper>
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

            <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
              <Paper
                sx={{
                  p: 3,
                  borderRadius: 2,
                  backgroundColor: "#ff6f00",
                  color: "white",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Payment Frequency
                </Typography>
                {walletLoading ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mt: 1,
                    }}
                  >
                    <CircularProgress size={24} sx={{ color: "white" }} />
                    <Typography variant="body2">Loading...</Typography>
                  </Box>
                ) : walletError ? (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Unable to load
                  </Typography>
                ) : (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="h5" fontWeight="bold">
                      {walletSettings?.payment_frequency
                        ? toProperCase(walletSettings.payment_frequency)
                        : "Not set"}
                    </Typography>
                    {walletSettings?.day_of_week && (
                      <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                        Every {toProperCase(walletSettings.day_of_week)}
                      </Typography>
                    )}
                  </Box>
                )}
              </Paper>
            </Box>

            <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
              <Paper
                sx={{
                  p: 3,
                  borderRadius: 2,
                  backgroundColor: "#00796b",
                  color: "white",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Next Payout
                </Typography>
                {walletLoading ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mt: 1,
                    }}
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
                      {new Date(
                        walletSettings.next_payout_at,
                      ).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.9 }}>
                      {new Date(
                        walletSettings.next_payout_at,
                      ).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
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

          {/* Miners Section */}
          <Paper
            elevation={3}
            sx={{
              p: 3,
              mb: 4,
              borderRadius: 2,
              background: (theme) =>
                theme.palette.mode === "dark"
                  ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
                  : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
              backdropFilter: "blur(10px)",
              border: (theme) => `1px solid ${theme.palette.divider}`,
            }}
          >
            <HostedMinersList customerId={customerId} />
          </Paper>

          {/* Account Statement Section */}
          <Paper
            elevation={3}
            sx={{
              p: 3,
              borderRadius: 2,
              background: (theme) =>
                theme.palette.mode === "dark"
                  ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
                  : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
              backdropFilter: "blur(10px)",
              border: (theme) => `1px solid ${theme.palette.divider}`,
            }}
          >
            <ElectricityCostTable customerId={customerId} />
          </Paper>
        </>
      )}
    </Box>
  );
}
