"use client";

/**
 * Top of the client wallet page - BitFactory Daylight theme (v1.3)
 *
 * - Page heading + pool mode Segmented control (Total / Luxor / Braiins)
 * - Balance hero (Total Earnings, guide §5 gradient area) + Revenue (24h) /
 *   Pending Payouts meta
 * - Per-subaccount wallet address / payment frequency / next payout cards
 * - ProfitLossChart (Daylight variant)
 *
 * Shared by the client's /wallet page and the admin-only /wallet-snapshot
 * page that is printed to PDF and emailed to the client, so the PDF shows
 * exactly what the client sees. In `snapshot` mode it loads `customerId`'s
 * data, drops every interactive control and reports when it has finished
 * loading via `onReady`.
 */

import React, { useEffect, useRef, useState } from "react";
import { Box, Typography, CircularProgress, Alert } from "@mui/material";
import ProfitLossChart from "@/components/ProfitLossChart";
import { useUser } from "@/lib/hooks/useUser";
import { LuxorPaymentSettings } from "@/lib/types/wallet";
import { useBitcoinLivePrice } from "@/components/useBitcoinLivePrice";
import BtcPriceLabel from "@/components/BtcPriceLabel";
import WalletSubaccountCards from "@/components/wallet/WalletSubaccountCards";
import GuildRewardWalletCard from "@/components/wallet/GuildRewardWalletCard";
import { isGuildRole } from "@/lib/customerRoles";
import Segmented, { SegmentedOption } from "@/components/daylight/Segmented";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

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

/** The request-change state and handlers for one subaccount's cards. */
export type WalletCardActions = Pick<
  React.ComponentProps<typeof WalletSubaccountCards>,
  | "hasPendingWalletChange"
  | "isPayoutFrozen"
  | "freezeLabel"
  | "activeWalletChangeRequest"
  | "onRequestChange"
  | "activeFrequencyChangeRequest"
  | "onRequestFrequencyChange"
>;

const READ_ONLY_CARD_ACTIONS: WalletCardActions = {
  hasPendingWalletChange: false,
  isPayoutFrozen: false,
  freezeLabel: null,
  activeWalletChangeRequest: undefined,
  onRequestChange: () => {},
  activeFrequencyChangeRequest: undefined,
  onRequestFrequencyChange: () => {},
};

interface WalletOverviewProps {
  /** `?subaccounts=` value for the earnings/settings fetches. */
  subaccountsParam: string;
  /** Load this customer's wallet instead of the signed-in user's (admin). */
  customerId?: string;
  /** Static PDF snapshot: no pool toggle, read-only cards, no chart
   * animation. */
  snapshot?: boolean;
  /** Request-change state and handlers per subaccount; omitted in snapshot
   * mode. */
  cardActions?: (settings: LuxorPaymentSettings) => WalletCardActions;
  /** Called once, when every figure on the page has finished loading. */
  onReady?: () => void;
  /** Replaces the "Wallet" title block (the PDF's branded heading); the BTC
   * price stays alongside it. */
  heading?: React.ReactNode;
}

/**
 * One figure in the wallet balance hero: label, BTC amount, USD equivalent.
 * The `hero` variant (Total Earnings) is larger; the others sit to its right
 * (below it on mobile) separated by a divider, so all three line up.
 */
function EarningsFigure({
  area,
  label,
  btc,
  usd,
  isLoading,
  error,
  hero = false,
}: {
  area: string;
  label: string;
  btc: number;
  usd: string;
  isLoading: boolean;
  error?: string | null;
  hero?: boolean;
}) {
  const { d, darkMode, fonts } = useDaylight();
  const divider = `1px solid ${darkMode ? d.borderSky : "#D7EAF3"}`;

  return (
    <Box
      sx={{
        gridArea: area,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        p: hero
          ? { xs: "22px 20px", sm: "26px 30px" }
          : { xs: "18px 20px", sm: "26px 28px" },
        // Dividers: below the hero on mobile, left of each meta column on
        // desktop, and between the two meta columns on mobile.
        ...(hero
          ? { borderBottom: { xs: divider, md: "none" } }
          : {
              borderLeft: {
                xs: area === "pending" ? divider : "none",
                md: divider,
              },
            }),
      }}
    >
      <Typography
        sx={{
          fontSize: { xs: 11, sm: 12 },
          fontWeight: 600,
          letterSpacing: ".04em",
          textTransform: "uppercase",
          color: d.muted,
        }}
      >
        {label}
      </Typography>

      {isLoading ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: "12px" }}>
          <CircularProgress size={hero ? 20 : 16} sx={{ color: d.action }} />
          <Typography sx={{ fontSize: 13, color: d.muted }}>
            Loading...
          </Typography>
        </Box>
      ) : error ? (
        <Typography sx={{ fontSize: 12, color: d.danger, mt: "12px" }}>
          {error}
        </Typography>
      ) : (
        <>
          <Typography
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 750,
              fontSize: hero ? { xs: 26, sm: 34 } : { xs: 18, sm: 24 },
              lineHeight: 1.2,
              letterSpacing: hero ? "-1px" : "-.5px",
              color: d.text,
              mt: hero ? "8px" : "10px",
              fontVariantNumeric: "tabular-nums",
              overflowWrap: "anywhere",
            }}
          >
            ₿ {btc.toFixed(8)}
          </Typography>
          <Typography
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 700,
              fontSize: hero ? { xs: 20, sm: 24 } : { xs: 14, sm: 16 },
              lineHeight: 1.3,
              color: d.success,
              mt: "6px",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ≈ ${usd}
            <Box
              component="span"
              sx={{
                fontFamily: fonts.body,
                fontWeight: 600,
                fontSize: hero ? { xs: 12, sm: 13 } : 11,
                color: d.muted,
                ml: "5px",
              }}
            >
              USD
            </Box>
          </Typography>
        </>
      )}
    </Box>
  );
}

export default function WalletOverview({
  subaccountsParam,
  customerId,
  snapshot = false,
  cardActions,
  onReady,
  heading,
}: WalletOverviewProps) {
  const { d, darkMode, fonts } = useDaylight();
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [revenue24h, setRevenue24h] = useState<Revenue24h | null>(null);
  const [walletSubaccounts, setWalletSubaccounts] = useState<
    LuxorPaymentSettings[]
  >([]);
  const [poolMode, setPoolMode] = useState<PoolMode>("total");
  const [activePoolNames, setActivePoolNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revenue24hLoading, setRevenue24hLoading] = useState(true);
  const [walletLoading, setWalletLoading] = useState(true);
  const [profitLossLoaded, setProfitLossLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revenue24hError, setRevenue24hError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  // A customer's wallet (admin snapshot / PDF) never needs the signed-in
  // user - and the PDF renderer has no session to look one up with.
  const { user } = useUser({ enabled: !customerId });
  // The signed-in user's own wallet waits for their id; a customer's wallet
  // (admin snapshot) can load straight away.
  const ownerReady = !!customerId || !!user?.id;
  const customerQuery = customerId
    ? `&customerId=${encodeURIComponent(customerId)}`
    : "";

  useEffect(() => {
    const fetchEarningsSummary = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(
          `/api/wallet/earnings-summary?subaccounts=${subaccountsParam}${customerQuery}`,
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
  }, [subaccountsParam, customerQuery]);

  useEffect(() => {
    const fetchRevenue24h = async () => {
      try {
        setRevenue24hLoading(true);
        setRevenue24hError(null);

        const response = await fetch(
          `/api/wallet/earnings-24h?subaccounts=${subaccountsParam}${customerQuery}`,
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
  }, [subaccountsParam, customerQuery]);

  useEffect(() => {
    const fetchWalletSettings = async () => {
      try {
        setWalletLoading(true);
        setWalletError(null);

        const response = await fetch(
          `/api/wallet/settings?currency=BTC&subaccounts=${subaccountsParam}${customerQuery}`,
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

    if (ownerReady) {
      fetchWalletSettings();
    }
  }, [ownerReady, subaccountsParam, customerQuery]);

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

  const { btcLiveData, btcPriceLoading } = useBitcoinLivePrice();
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

  // Report readiness once, when every fetch (and the BTC price the USD
  // figures depend on) has settled.
  const readyReported = useRef(false);
  const allLoaded =
    !isLoading &&
    !revenue24hLoading &&
    !walletLoading &&
    profitLossLoaded &&
    !btcPriceLoading;
  useEffect(() => {
    if (allLoaded && onReady && !readyReported.current) {
      readyReported.current = true;
      onReady();
    }
  }, [allLoaded, onReady]);

  return (
    <>
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
        {heading ?? (
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
        )}

        <Box
          sx={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {!snapshot && activePoolNames.length > 1 && (
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
          Pending Payouts alongside it. All three share one label -> BTC ->
          USD structure, top-aligned in a grid with dividers between them. */}
      <Box
        className="snapshot-block"
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr 1fr",
            md: "minmax(0, 1.7fr) minmax(0, 1fr) minmax(0, 1fr)",
          },
          gridTemplateAreas: {
            xs: '"total total" "revenue pending"',
            md: '"total revenue pending"',
          },
          alignItems: "stretch",
          mb: { xs: "18px", sm: "22px" },
          borderRadius: RADIUS_CARD,
          overflow: "hidden",
          background: darkMode
            ? d.skySoft
            : "linear-gradient(110deg, #EDF8FF, #F0FAF6)",
          border: `1px solid ${darkMode ? d.borderSky : "#D7EAF3"}`,
        }}
      >
        <EarningsFigure
          area="total"
          hero
          label={`Total Earnings${poolSuffix}`}
          isLoading={isLoading}
          btc={getTotalEarnings()}
          usd={usdEquivalent(getTotalEarnings())}
        />
        <EarningsFigure
          area="revenue"
          label={`Revenue (24h)${poolSuffix}`}
          isLoading={revenue24hLoading}
          error={revenue24hError}
          btc={getRevenue24h()}
          usd={usdEquivalent(getRevenue24h())}
        />
        <EarningsFigure
          area="pending"
          label={`Pending Payouts${poolSuffix}`}
          isLoading={isLoading}
          btc={getPendingPayouts()}
          usd={usdEquivalent(getPendingPayouts())}
        />
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
          ) : !customerId && !snapshot && isGuildRole(user?.role) ? (
            // Luxor pays the guild to a Higgs wallet - show the member's
            // own reward wallet instead of the Luxor payout settings.
            <GuildRewardWalletCard />
          ) : walletError ? (
            <Alert severity="error" sx={{ gridColumn: "1 / -1" }}>
              {walletError}
            </Alert>
          ) : (
            walletSubaccounts.map((settings) => (
              <WalletSubaccountCards
                key={settings.subaccount?.id ?? settings.subaccount?.name}
                daylight
                readOnly={snapshot || !cardActions}
                settings={settings}
                isDark={false}
                dimmed={false}
                {...(cardActions && !snapshot
                  ? cardActions(settings)
                  : READ_ONLY_CARD_ACTIONS)}
              />
            ))
          )}
        </Box>
      )}

      {/* Profit & Loss Overview */}
      <Box className="snapshot-block">
        <ProfitLossChart
          daylight
          customerId={customerId}
          animate={!snapshot}
          onLoaded={() => setProfitLossLoaded(true)}
          totalEarningsBtc={getTotalEarnings()}
          btcPriceUsd={btcPriceUsd}
        />
      </Box>
    </>
  );
}
