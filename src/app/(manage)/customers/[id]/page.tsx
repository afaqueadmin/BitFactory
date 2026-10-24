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
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Email as EmailIcon,
} from "@mui/icons-material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ElectricityCostTable from "@/components/ElectricityCostTable";
import HostedMinersList from "@/components/HostedMinersList";
import PoolAuthSection from "@/components/PoolAuthSection";
import LoginEmailsSection from "@/components/LoginEmailsSection";
import HashrateHistoryChart from "@/components/HashrateHistoryChart";
import TransactionHistorySection from "@/components/TransactionHistorySection";
import CustomerInvoicesTable from "@/components/CustomerInvoicesTable";
import BalanceCard from "@/components/dashboardCards/BalanceCard";
import CostsCard from "@/components/dashboardCards/CostsCard";
import EstimatedMiningDaysLeftCard from "@/components/dashboardCards/EstimatedMiningDaysLeftCard";
import EstimatedMonthlyCostCard from "@/components/dashboardCards/EstimatedMonthlyCostCard";
import { getDaysInCurrentMonth } from "@/lib/helpers/getDaysInCurrentMonth";
import { formatValue } from "@/lib/helpers/formatValue";
import { LuxorPaymentSettings } from "@/lib/types/wallet";
import { useBitcoinLivePrice } from "@/components/useBitcoinLivePrice";
import { DaylightThemedPage } from "@/components/daylight/DaylightMuiScope";
import {
  DaylightLoading,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import { useDaylight } from "@/lib/daylight";

// "All subaccounts" option value in the subaccount filter.
const ALL_SUBACCOUNTS = "__all__";

interface CustomerDetails {
  id: string;
  name: string;
  email: string;
  role: string;
  city: string;
  country: string;
  phoneNumber: string;
  companyName: string;
  streetAddress: string;
  twoFactorEnabled: boolean;
  joinDate: string;
  isDeleted: boolean;
  miners: number;
  status: "active" | "inactive";
  /** The customer's Luxor subaccount names, oldest first. */
  luxorSubaccounts: string[];
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
//             <CircularProgress size={20} color="inherit" />
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
  const [activeView, setActiveView] = React.useState<
    "statement" | "transactions" | "invoices"
  >("statement");

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

        const { user, subaccounts } = await response.json();
        console.log(user);
        return {
          luxorSubaccounts: Array.isArray(subaccounts)
            ? subaccounts.map((s: { authKey: string }) => s.authKey)
            : [],
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          city: user.city || "",
          country: user.country || "",
          phoneNumber: user.phoneNumber || "",
          companyName: user.companyName || "",
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

  // Which of the customer's Luxor subaccounts the pool data below is scoped
  // to - same "all or a subset" model as the client's own subaccount filter.
  // Balance, costs, statement and invoices are per customer, not per
  // subaccount, so they ignore it.
  const allSubaccounts = React.useMemo(
    () => customer?.luxorSubaccounts ?? [],
    [customer?.luxorSubaccounts],
  );
  const [selectedSubaccounts, setSelectedSubaccounts] = React.useState<
    string[] | "all"
  >("all");
  // Drop names that no longer belong to the customer (e.g. removed in the
  // Pool Authentication section below); fall back to all if none are left.
  const subaccountsInView = React.useMemo(() => {
    if (selectedSubaccounts === "all") return allSubaccounts;
    const kept = selectedSubaccounts.filter((s) => allSubaccounts.includes(s));
    return kept.length > 0 ? kept : allSubaccounts;
  }, [selectedSubaccounts, allSubaccounts]);
  const isFilteringSubaccounts =
    subaccountsInView.length < allSubaccounts.length;
  const subaccountsParam = isFilteringSubaccounts
    ? subaccountsInView.join(",")
    : "all";

  const queryClient = useQueryClient();
  const refreshSubaccountData = () => {
    queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
    queryClient.invalidateQueries({ queryKey: ["walletSettings", customerId] });
    queryClient.invalidateQueries({
      queryKey: ["earningsSummary", customerId],
    });
  };

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
    queryKey: ["earningsSummary", customerId, subaccountsParam],
    queryFn: async () => {
      try {
        const response = await fetch(
          `/api/wallet/earnings-summary?customerId=${customerId}&subaccounts=${encodeURIComponent(subaccountsParam)}`,
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

  // Fetch wallet settings - one entry per Luxor subaccount in view, since
  // payout frequency/schedule is configured per subaccount in Luxor.
  const {
    data: walletSettings,
    isLoading: walletLoading,
    error: walletError,
  } = useQuery<LuxorPaymentSettings[]>({
    queryKey: ["walletSettings", customerId, subaccountsParam],
    queryFn: async () => {
      try {
        const response = await fetch(
          `/api/wallet/settings?currency=BTC&customerId=${customerId}&subaccounts=${encodeURIComponent(subaccountsParam)}`,
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
        if (data.success && (data.subaccounts || data.data)) {
          console.log("[Wallet] Settings loaded from Luxor:", data.subaccounts);
          return data.subaccounts || [data.data];
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

  const payoutSettings = walletSettings ?? [];
  const showSubaccountNames = payoutSettings.length > 1;
  const settingsLabel = (settings: LuxorPaymentSettings) =>
    settings.subaccount?.name || String(settings.subaccount?.id ?? "");

  const { btcLiveData, BtcLivePriceComponent } = useBitcoinLivePrice();
  const { d, fonts } = useDaylight();
  const { toggleGroupSx } = useDaylightAdminSx();
  // Soft-tone value card, matching the Daylight StatCard next to it.
  const toneCardSx = (tone: "sky" | "mint" | "amber") => {
    const t = {
      sky: { bg: d.skySoft, border: d.borderSky },
      mint: { bg: d.mint, border: d.borderMint },
      amber: { bg: d.amber, border: d.borderAmber },
    }[tone];
    return {
      p: { xs: "15px 13px", sm: "19px 20px" },
      height: "100%",
      bgcolor: t.bg,
      border: `1px solid ${t.border}`,
      color: d.text,
      "& .MuiTypography-h5, & .MuiTypography-h6": {
        fontFamily: fonts.heading,
        fontWeight: 750,
        fontVariantNumeric: "tabular-nums",
      },
      "& .MuiTypography-h5": { fontSize: { xs: 20, sm: 22 } },
      "& .MuiTypography-h6": { fontSize: { xs: 16, sm: 17 } },
      "& .MuiTypography-caption, & .MuiTypography-body2": {
        color: d.cardMuted,
      },
    };
  };
  const cardLabelSx = {
    fontSize: { xs: 11, sm: 12 },
    color: d.cardMuted,
    mb: "8px",
  };
  return (
    <DaylightThemedPage>
      {/* Back Button */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.back()}
        sx={{ mb: 2 }}
      >
        Back
      </Button>

      {customerLoading ? (
        <DaylightLoading />
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
              flexWrap: "wrap",
              gap: 2,
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
                    sx={{ color: d.danger }}
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
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 1,
                  mt: 1,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Luxor subaccounts:
                </Typography>
                {allSubaccounts.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    None assigned
                  </Typography>
                ) : (
                  allSubaccounts.map((name) => (
                    <Chip key={name} label={name} size="small" />
                  ))
                )}
              </Box>
              {allSubaccounts.length > 1 && (
                <Box sx={{ mt: 2 }}>
                  <FormControl size="small" sx={{ minWidth: 260 }}>
                    <InputLabel id="customer-subaccount-filter-label">
                      Viewing subaccounts
                    </InputLabel>
                    <Select
                      labelId="customer-subaccount-filter-label"
                      label="Viewing subaccounts"
                      multiple
                      value={subaccountsInView}
                      renderValue={(selected) =>
                        isFilteringSubaccounts
                          ? selected.join(", ")
                          : "All subaccounts"
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        const next =
                          typeof value === "string" ? value.split(",") : value;
                        if (next.includes(ALL_SUBACCOUNTS)) {
                          setSelectedSubaccounts("all");
                          return;
                        }
                        // Keep at least one selected
                        if (next.length === 0) return;
                        setSelectedSubaccounts(
                          next.length === allSubaccounts.length ? "all" : next,
                        );
                      }}
                    >
                      <MenuItem value={ALL_SUBACCOUNTS}>
                        <Checkbox
                          size="small"
                          checked={!isFilteringSubaccounts}
                        />
                        <ListItemText primary="All subaccounts" />
                      </MenuItem>
                      {allSubaccounts.map((name) => (
                        <MenuItem key={name} value={name}>
                          <Checkbox
                            size="small"
                            checked={subaccountsInView.includes(name)}
                          />
                          <ListItemText primary={name} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {isFilteringSubaccounts && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 0.5 }}
                    >
                      Earnings, payouts, transactions, hashrate and miner status
                      show the selected subaccounts only. Balance, costs,
                      statement and invoices are per customer.
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: { xs: "flex-start", sm: "flex-end" },
                gap: 1.5,
              }}
            >
              {BtcLivePriceComponent}
              {/* Opens the compose page in a new tab: email the customer a
                  PDF of their wallet page. */}
              <Button
                variant="outlined"
                size="small"
                startIcon={<EmailIcon />}
                href={`/customers/${customerId}/wallet-email`}
                target="_blank"
                rel="noopener"
              >
                Email wallet snapshot
              </Button>
            </Box>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              <strong>Error loading earnings:</strong>{" "}
              {error?.message || "An error occurred"}
            </Alert>
          )}

          {/* Balance Cards */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
              gap: 2,
              mb: 3,
              "& > *": { minWidth: 0 },
            }}
          >
            <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
              <BalanceCard value={balanceLoading ? 0 : balance} />
            </Box>
            <Box>
              <Paper sx={toneCardSx("sky")}>
                <Typography component="div" sx={cardLabelSx}>
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
                    <CircularProgress size={20} color="inherit" />
                    <Typography variant="body2">Loading...</Typography>
                  </Box>
                ) : (
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      columnGap: 2,
                      justifyContent: "space-between",
                      alignItems: "baseline",
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
              <Paper sx={toneCardSx("mint")}>
                <Typography component="div" sx={cardLabelSx}>
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
                    <CircularProgress size={20} color="inherit" />
                    <Typography variant="body2">Loading...</Typography>
                  </Box>
                ) : (
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      columnGap: 2,
                      justifyContent: "space-between",
                      alignItems: "baseline",
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
              <Paper sx={toneCardSx("amber")}>
                <Typography component="div" sx={cardLabelSx}>
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
                    <CircularProgress size={20} color="inherit" />
                    <Typography variant="body2">Loading...</Typography>
                  </Box>
                ) : walletError ? (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Unable to load
                  </Typography>
                ) : payoutSettings.length === 0 ? (
                  <Typography variant="h5" fontWeight="bold" sx={{ mt: 1 }}>
                    Not set
                  </Typography>
                ) : (
                  payoutSettings.map((settings) => (
                    <Box key={settingsLabel(settings)} sx={{ mt: 1 }}>
                      {showSubaccountNames && (
                        <Typography variant="caption" sx={{ opacity: 0.85 }}>
                          {settingsLabel(settings)}
                        </Typography>
                      )}
                      <Typography
                        variant={showSubaccountNames ? "h6" : "h5"}
                        fontWeight="bold"
                      >
                        {settings.payment_frequency
                          ? toProperCase(settings.payment_frequency)
                          : "Not set"}
                      </Typography>
                      {settings.payment_frequency === "WEEKLY" &&
                        settings.day_of_week && (
                          <Typography
                            variant="body2"
                            sx={{
                              mt: showSubaccountNames ? 0 : 1,
                              opacity: 0.9,
                            }}
                          >
                            Every {toProperCase(settings.day_of_week)}
                          </Typography>
                        )}
                    </Box>
                  ))
                )}
              </Paper>
            </Box>

            <Box sx={{ flex: { xs: 1, md: "1 1 25%" }, minWidth: 0 }}>
              <Paper sx={toneCardSx("sky")}>
                <Typography component="div" sx={cardLabelSx}>
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
                    <CircularProgress size={20} color="inherit" />
                    <Typography variant="body2">Loading...</Typography>
                  </Box>
                ) : walletError ? (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Unable to load
                  </Typography>
                ) : payoutSettings.length === 0 ? (
                  <Typography variant="h6" fontWeight="bold" sx={{ mt: 1 }}>
                    Not scheduled
                  </Typography>
                ) : (
                  payoutSettings.map((settings) => {
                    const payoutDate = settings.next_payout_at
                      ? new Date(settings.next_payout_at)
                      : null;
                    const twoHoursLaterPayoutDate = payoutDate
                      ? new Date(payoutDate.getTime() + 2 * 60 * 60 * 1000)
                      : null;
                    return (
                      <Box key={settingsLabel(settings)} sx={{ mt: 1 }}>
                        {showSubaccountNames && (
                          <Typography variant="caption" sx={{ opacity: 0.85 }}>
                            {settingsLabel(settings)}
                          </Typography>
                        )}
                        {payoutDate && twoHoursLaterPayoutDate ? (
                          <>
                            <Typography variant="h6" fontWeight="bold">
                              {payoutDate.toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ mt: 0.5, opacity: 0.9 }}
                            >
                              {payoutDate.toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              -{" "}
                              {twoHoursLaterPayoutDate.toLocaleTimeString(
                                "en-US",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}{" "}
                              (
                              {new Intl.DateTimeFormat("en-US", {
                                timeZoneName: "shortOffset",
                              })
                                .formatToParts(payoutDate)
                                .find((part) => part.type === "timeZoneName")
                                ?.value || "GMT"}
                              )
                            </Typography>
                          </>
                        ) : (
                          <Typography variant="h6" fontWeight="bold">
                            Not scheduled
                          </Typography>
                        )}
                      </Box>
                    );
                  })
                )}
              </Paper>
            </Box>
          </Box>

          {/* Pool Authentication Section */}
          <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
            <PoolAuthSection
              customerId={customerId}
              onChange={refreshSubaccountData}
            />
          </Paper>

          {/* Sign-in emails: the primary, plus an optional second one for
              another person on the account. */}
          <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
            <LoginEmailsSection customerId={customerId} />
          </Paper>

          {/* Hashrate & Shares Efficiency history for this customer. The API
              authorises the userId param for ADMIN/SUPER_ADMIN. */}
          <Box sx={{ mb: 3 }}>
            <HashrateHistoryChart
              daylight
              userId={customerId}
              subaccountsParam={subaccountsParam}
            />
          </Box>

          {/* Miners Section */}
          {/* Live status follows the subaccount filter - miners reporting
              under an unselected subaccount show as offline. The list itself
              isn't filtered: miners aren't linked to a subaccount yet. */}
          <Box sx={{ mb: 3 }}>
            <HostedMinersList
              daylight
              customerId={customerId}
              subaccountsParam={subaccountsInView.join(",")}
            />
          </Box>

          {/* Account Statement / Transaction History / Invoices Section */}
          <Box sx={{ mb: 3 }}>
            <ToggleButtonGroup
              value={activeView}
              exclusive
              onChange={(event, newView) => {
                if (newView !== null) {
                  setActiveView(newView);
                }
              }}
              size="small"
              sx={{ ...toggleGroupSx, flexWrap: "wrap", mb: 2 }}
            >
              <ToggleButton value="statement">Account Statement</ToggleButton>
              <ToggleButton value="transactions">
                Transaction History
              </ToggleButton>
              <ToggleButton value="invoices">Invoices</ToggleButton>
            </ToggleButtonGroup>

            {activeView === "statement" && (
              <ElectricityCostTable daylight customerId={customerId} />
            )}
            {activeView !== "statement" && (
              <Paper sx={{ p: { xs: 2, sm: 3 } }}>
                {activeView === "transactions" && (
                  <TransactionHistorySection
                    customerId={customerId}
                    subaccountsParam={subaccountsParam}
                  />
                )}
                {activeView === "invoices" && (
                  <CustomerInvoicesTable customerId={customerId} />
                )}
              </Paper>
            )}
          </Box>
        </>
      )}
    </DaylightThemedPage>
  );
}
