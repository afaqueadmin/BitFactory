"use client";

/**
 * Wallet page (authenticated) - BitFactory Daylight theme (v1.3)
 *
 * Composes:
 * - Page heading + pool mode Segmented control (Total / Luxor / Braiins)
 * - Balance hero (Total Earnings, guide §5 gradient area) + Revenue (24h) /
 *   Pending Payouts meta
 * - Per-subaccount wallet address / payment frequency / next payout cards
 * - ProfitLossChart (Daylight variant)
 * - Statement download card
 * - Wallet Change Requests (Daylight WalletChangeRequestHistory)
 * - ElectricityCostTable (Daylight variant)
 */

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  TextField,
  Alert,
} from "@mui/material";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import ElectricityCostTable from "@/components/ElectricityCostTable";
import ProfitLossChart from "@/components/ProfitLossChart";
import { useUser } from "@/lib/hooks/useUser";
import { LuxorPaymentSettings } from "@/lib/types/wallet";
import { useBitcoinLivePrice } from "@/components/useBitcoinLivePrice";
import BtcPriceLabel from "@/components/BtcPriceLabel";
import { useWalletChangeRequests } from "@/lib/hooks/useWalletChangeRequests";
import RequestWalletChangeModal from "@/components/wallet/RequestWalletChangeModal";
import WalletChangeRequestHistory from "@/components/wallet/WalletChangeRequestHistory";
import WalletSubaccountCards from "@/components/wallet/WalletSubaccountCards";
import { useFreezeRemaining } from "@/components/wallet/FreezeCountdown";
import { useSubaccountFilter } from "@/lib/contexts/subaccountFilter-context";
import Segmented, { SegmentedOption } from "@/components/daylight/Segmented";
import { MQ, RADIUS_CARD, useDaylight } from "@/lib/daylight";

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

type PoolMode = "total" | "luxor" | "braiins";

const POOL_MODE_OPTIONS: SegmentedOption<PoolMode>[] = [
  { id: "total", label: "Total" },
  { id: "luxor", label: "Luxor" },
  { id: "braiins", label: "Braiins" },
];

export default function WalletPage() {
  const { d, fonts } = useDaylight();
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [revenue24h, setRevenue24h] = useState<Revenue24h | null>(null);
  const [walletSubaccounts, setWalletSubaccounts] = useState<
    LuxorPaymentSettings[]
  >([]);
  const [poolMode, setPoolMode] = useState<PoolMode>("total");
  const [activePoolNames, setActivePoolNames] = useState<string[]>([]);
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

  // Wallet change request state - which subaccount's card opened the modal
  const [requestChangeSubaccount, setRequestChangeSubaccount] =
    useState<LuxorPaymentSettings | null>(null);
  const { requests: walletChangeRequests } = useWalletChangeRequests();
  const activeWalletChangeRequest = walletChangeRequests.find(
    (req) => req.status === "PENDING" || req.status === "CONFIRMED",
  );
  const latestApprovedRequest = walletChangeRequests
    .filter((req) => req.status === "APPROVED")
    .sort(
      (a, b) =>
        new Date(b.reviewedAt ?? 0).getTime() -
        new Date(a.reviewedAt ?? 0).getTime(),
    )[0];
  const { isFrozen: isPayoutFrozen, label: freezeLabel } = useFreezeRemaining(
    latestApprovedRequest?.reviewedAt,
  );
  const hasPendingWalletChange = !!activeWalletChangeRequest || isPayoutFrozen;

  const { user } = useUser();
  const { queryParam: subaccountsParam } = useSubaccountFilter();

  useEffect(() => {
    const fetchEarningsSummary = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(
          `/api/wallet/earnings-summary?subaccounts=${subaccountsParam}`,
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch earnings summary: ${response.statusText}`,
          );
        }

        const data: EarningsSummary = await response.json();
        setSummary(data);
        setActivePoolNames(data.activePoolNames || []);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[Wallet] Error fetching earnings summary:", error);
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEarningsSummary();
  }, [subaccountsParam]);

  useEffect(() => {
    const fetchRevenue24h = async () => {
      try {
        setRevenue24hLoading(true);
        setRevenue24hError(null);

        const response = await fetch(
          `/api/wallet/earnings-24h?subaccounts=${subaccountsParam}`,
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch 24h revenue: ${response.statusText}`,
          );
        }

        const data: Revenue24h = await response.json();
        setRevenue24h(data);
        setActivePoolNames(data.activePoolNames || []);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[Wallet] Error fetching 24h revenue:", error);
        setRevenue24hError(errorMessage);
      } finally {
        setRevenue24hLoading(false);
      }
    };

    fetchRevenue24h();
  }, [subaccountsParam]);

  useEffect(() => {
    const fetchWalletSettings = async () => {
      try {
        setWalletLoading(true);
        setWalletError(null);

        const response = await fetch(
          `/api/wallet/settings?currency=BTC&subaccounts=${subaccountsParam}`,
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
          setWalletSubaccounts(data.subaccounts || [data.data]);
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
  }, [user?.id, subaccountsParam]);

  // Auto-reset poolMode if selected pool is not in activePoolNames
  useEffect(() => {
    if (
      activePoolNames.length > 0 &&
      poolMode !== "total" &&
      !activePoolNames.includes(poolMode === "luxor" ? "Luxor" : "Braiins")
    ) {
      setPoolMode("total");
    }
  }, [activePoolNames, poolMode]);

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

  const { btcLiveData } = useBitcoinLivePrice();
  const btcPriceUsd = btcLiveData?.price
    ? typeof btcLiveData.price === "string"
      ? parseFloat(btcLiveData.price)
      : btcLiveData.price
    : null;

  const usdEquivalent = (btc: number) =>
    btc && btcPriceUsd
      ? (btc * btcPriceUsd).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "0.00";

  const poolSuffix = poolMode !== "total" ? ` (${poolMode.toUpperCase()})` : "";

  // Handle statement download
  const handleDownloadStatement = async () => {
    try {
      setStatementError(null);

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

  const sectionHeading = (text: string) => (
    <Typography
      component="h2"
      sx={{
        fontFamily: fonts.heading,
        fontWeight: 750,
        fontSize: 18,
        letterSpacing: "-.035em",
        color: d.text,
        mb: "14px",
      }}
    >
      {text}
    </Typography>
  );

  return (
    <Box
      sx={{ maxWidth: 1600, mx: "auto", fontFamily: fonts.body, color: d.text }}
    >
      {/* Page heading */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
          mb: { xs: "20px", md: "26px" },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 750,
              fontSize: { xs: 27, md: 32 },
              lineHeight: 1.3,
              letterSpacing: "-.035em",
              color: d.text,
            }}
          >
            Wallet
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: 12, md: 13 },
              lineHeight: { xs: 1.7, md: 1.5 },
              color: d.muted,
              mt: "7px",
            }}
          >
            Overview of your mining earnings, payouts, and financial records.
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {activePoolNames.length > 1 && (
            <Segmented
              value={poolMode}
              onChange={setPoolMode}
              ariaLabel="Pool mode"
              options={POOL_MODE_OPTIONS.filter(
                (o) =>
                  o.id === "total" ||
                  activePoolNames.includes(
                    o.id === "luxor" ? "Luxor" : "Braiins",
                  ),
              )}
            />
          )}
          <BtcPriceLabel daylight />
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <strong>Error loading earnings:</strong> {error}
        </Alert>
      )}

      {/* Balance hero (guide §5): Total Earnings, with Revenue (24h) and
          Pending Payouts as meta figures alongside it. */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "24px",
          p: { xs: "22px", sm: "26px 30px" },
          mb: { xs: "18px", sm: "22px" },
          borderRadius: RADIUS_CARD,
          background: "linear-gradient(110deg, #EDF8FF, #F0FAF6)",
          border: "1px solid #D7EAF3",
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 12, color: d.muted }}>
            Total Earnings{poolSuffix}
          </Typography>
          {isLoading ? (
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, mt: "8px" }}
            >
              <CircularProgress size={20} sx={{ color: d.action }} />
              <Typography sx={{ fontSize: 13, color: d.muted }}>
                Loading...
              </Typography>
            </Box>
          ) : (
            <>
              <Typography
                sx={{
                  fontFamily: fonts.heading,
                  fontWeight: 750,
                  fontSize: { xs: 32, sm: 40 },
                  letterSpacing: "-1.5px",
                  color: d.text,
                  mt: "4px",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                ₿ {getTotalEarnings().toFixed(8)}
              </Typography>
              <Typography sx={{ fontSize: 12, color: d.muted, mt: "6px" }}>
                ≈ ${usdEquivalent(getTotalEarnings())} USD
              </Typography>
            </>
          )}
        </Box>

        <Box
          sx={{
            display: "flex",
            gap: { xs: "24px", sm: "40px" },
            flexWrap: "wrap",
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 11, color: d.muted }}>
              Revenue (24h){poolSuffix}
            </Typography>
            {revenue24hLoading ? (
              <CircularProgress size={16} sx={{ color: d.action, mt: "8px" }} />
            ) : revenue24hError ? (
              <Typography sx={{ fontSize: 11, color: d.danger, mt: "8px" }}>
                {revenue24hError}
              </Typography>
            ) : (
              <>
                <Typography
                  component="strong"
                  sx={{
                    display: "block",
                    fontFamily: fonts.heading,
                    fontWeight: 700,
                    fontSize: 23,
                    color: d.text,
                    mt: "8px",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ₿ {getRevenue24h().toFixed(8)}
                </Typography>
                <Typography
                  component="small"
                  sx={{ fontSize: 11, color: d.muted }}
                >
                  ≈ ${usdEquivalent(getRevenue24h())}
                </Typography>
              </>
            )}
          </Box>

          <Box>
            <Typography sx={{ fontSize: 11, color: d.muted }}>
              Pending Payouts{poolSuffix}
            </Typography>
            {isLoading ? (
              <CircularProgress size={16} sx={{ color: d.action, mt: "8px" }} />
            ) : (
              <>
                <Typography
                  component="strong"
                  sx={{
                    display: "block",
                    fontFamily: fonts.heading,
                    fontWeight: 700,
                    fontSize: 23,
                    color: d.text,
                    mt: "8px",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ₿ {getPendingPayouts().toFixed(8)}
                </Typography>
                <Typography
                  component="small"
                  sx={{ fontSize: 11, color: d.muted }}
                >
                  ≈ ${usdEquivalent(getPendingPayouts())}
                </Typography>
              </>
            )}
          </Box>
        </Box>
      </Box>

      {/* Wallet address / payment frequency / next payout - one group per
          Luxor subaccount currently in view. */}
      {poolMode !== "braiins" && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              lg: "repeat(3, 1fr)",
            },
            gap: { xs: "12px", sm: "16px" },
            mb: { xs: "18px", sm: "22px" },
          }}
        >
          {walletLoading ? (
            <Box
              sx={{
                gridColumn: "1 / -1",
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <CircularProgress size={18} sx={{ color: d.action }} />
              <Typography sx={{ fontSize: 13, color: d.muted }}>
                Loading wallet settings...
              </Typography>
            </Box>
          ) : walletError ? (
            <Alert severity="error" sx={{ gridColumn: "1 / -1" }}>
              {walletError}
            </Alert>
          ) : (
            walletSubaccounts.map((settings) => (
              <WalletSubaccountCards
                key={settings.subaccount?.id ?? settings.subaccount?.name}
                daylight
                settings={settings}
                isDark={false}
                dimmed={false}
                hasPendingWalletChange={hasPendingWalletChange}
                isPayoutFrozen={isPayoutFrozen}
                freezeLabel={freezeLabel}
                activeWalletChangeRequest={activeWalletChangeRequest}
                onRequestChange={() => setRequestChangeSubaccount(settings)}
              />
            ))
          )}
        </Box>
      )}

      {/* Profit & Loss Overview */}
      <ProfitLossChart
        daylight
        totalEarningsBtc={getTotalEarnings()}
        btcPriceUsd={btcPriceUsd}
      />

      {/* Statement Download Section */}
      <Box sx={{ width: "100%", mt: { xs: "20px", md: "26px" } }}>
        <Box
          sx={{
            p: { xs: "20px", sm: "24px" },
            borderRadius: RADIUS_CARD,
            bgcolor: d.surface,
            border: `1px solid ${d.border}`,
            boxShadow: d.shadow,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              mb: "6px",
            }}
          >
            <Box
              aria-hidden
              sx={{
                display: "grid",
                placeItems: "center",
                width: 33,
                height: 33,
                borderRadius: "8px",
                bgcolor: d.skySoft,
                color: d.action,
                flexShrink: 0,
              }}
            >
              <PictureAsPdfIcon sx={{ fontSize: 18 }} />
            </Box>
            <Typography
              sx={{
                fontFamily: fonts.heading,
                fontWeight: 750,
                fontSize: 16,
                color: d.text,
              }}
            >
              Download Account Statement
            </Typography>
          </Box>
          <Typography sx={{ fontSize: 12, color: d.muted, mb: "18px" }}>
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
              gap: "12px",
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
              inputProps={{ max: new Date().toISOString().split("T")[0] }}
              fullWidth
              size="small"
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: "8px",
                  bgcolor: d.surface,
                  "& fieldset": { borderColor: d.inputBorder },
                  "&:hover fieldset": { borderColor: d.action },
                },
                "& .MuiOutlinedInput-root.Mui-focused fieldset": {
                  borderColor: d.action,
                },
              }}
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
              inputProps={{ max: new Date().toISOString().split("T")[0] }}
              fullWidth
              size="small"
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: "8px",
                  bgcolor: d.surface,
                  "& fieldset": { borderColor: d.inputBorder },
                  "&:hover fieldset": { borderColor: d.action },
                },
                "& .MuiOutlinedInput-root.Mui-focused fieldset": {
                  borderColor: d.action,
                },
              }}
            />
            <Button
              variant="contained"
              onClick={handleDownloadStatement}
              disabled={
                statementDownloading || !statementStartDate || !statementEndDate
              }
              fullWidth
              sx={{
                whiteSpace: "nowrap",
                borderRadius: "8px",
                py: { xs: 1, sm: 0.9 },
                fontWeight: 600,
                textTransform: "none",
                fontFamily: fonts.body,
                bgcolor: d.action,
                boxShadow: "none",
                "&:hover": { bgcolor: d.actionHover, boxShadow: "none" },
                [MQ.mobile]: { minHeight: 44 },
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
        </Box>
      </Box>

      {/* Wallet Change Requests */}
      <Box sx={{ width: "100%", mt: { xs: "20px", md: "26px" } }}>
        {sectionHeading("Wallet Change Requests")}
        <WalletChangeRequestHistory daylight />
      </Box>

      {requestChangeSubaccount && (
        <RequestWalletChangeModal
          open={!!requestChangeSubaccount}
          onClose={() => setRequestChangeSubaccount(null)}
          subaccountName={
            requestChangeSubaccount.subaccount?.name ||
            String(requestChangeSubaccount.subaccount?.id ?? "")
          }
          currentAddress={
            requestChangeSubaccount.addresses &&
            requestChangeSubaccount.addresses.length > 0
              ? requestChangeSubaccount.addresses.reduce((prev, current) =>
                  current.revenue_allocation > prev.revenue_allocation
                    ? current
                    : prev,
                ).external_address
              : "Not configured"
          }
        />
      )}

      {/* Electricity Cost Table - the component sets its own top margin */}
      <ElectricityCostTable daylight />
    </Box>
  );
}
