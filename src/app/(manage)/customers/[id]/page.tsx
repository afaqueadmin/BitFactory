"use client";

import React, { useEffect, useState } from "react";
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
import ElectricityCostTable from "@/components/ElectricityCostTable";
import HostedMinersList from "@/components/HostedMinersList";
import BalanceCard from "@/components/dashboardCards/BalanceCard";

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

  const [customer, setCustomer] = useState<CustomerDetails | null>(null);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [balance, setBalance] = React.useState<number>(0);
  const [balanceLoading, setBalanceLoading] = React.useState(true);
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch customer details
  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        setCustomerLoading(true);
        setCustomerError(null);

        const response = await fetch(
          `/api/user/profile?customerId=${customerId}`,
        );

        if (!response.ok) {
          setCustomerError("Failed to fetch customer details");
          return;
        }

        const { user } = await response.json();
        console.log(user);
        setCustomer({
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
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("Error fetching customer:", error);
        setCustomerError(errorMessage);
      } finally {
        setCustomerLoading(false);
      }
    };

    if (customerId) {
      fetchCustomer();
    }
  }, [customerId]);

  // Fetch balance on component mount
  React.useEffect(() => {
    const fetchBalance = async () => {
      try {
        setBalanceLoading(true);
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

    if (customerId) {
      fetchBalance();
    }
  }, [customerId]);

  useEffect(() => {
    // Fetch earnings summary from API
    const fetchEarningsSummary = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(
          `/api/wallet/earnings-summary?customerId=${customerId}`,
        );

        if (!response.ok) {
          setError(`Failed to fetch earnings summary: ${response.statusText}`);
          return;
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
    if (customerId) {
      fetchEarningsSummary();
    }
  }, [customerId]);

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
          {customerError || "Failed to load customer details"}
        </Alert>
      ) : (
        <>
          {/* Customer Header */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="h4" fontWeight="bold" gutterBottom>
              {customer.name}
            </Typography>
            <Typography variant="body1" color="text.secondary" gutterBottom>
              {customer.email} • {customer.role}
            </Typography>
            {customer.companyName && (
              <Typography variant="body2" color="text.secondary">
                Company: {customer.companyName}
              </Typography>
            )}
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
                <strong>Error loading earnings:</strong> {error}
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
            <BalanceCard value={balanceLoading ? 0 : balance} />
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
                      ${summary?.totalEarnings.usd.toFixed(2) ?? "0.00"}
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
                      ${summary?.pendingPayouts.usd.toFixed(2) ?? "0.00"}
                    </Typography>
                  </Box>
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
