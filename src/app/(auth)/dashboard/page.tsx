// src/app/(auth)/dashboard/page.tsx
"use client";

/**
 * Dashboard page (authenticated) - BitFactory Daylight theme (v1.3)
 *
 * Composes:
 * - DashboardHeader (Daylight variant)
 * - Four Daylight KPI StatCards (balance, daily cost, days left, monthly cost)
 * - Mining Performance chart card (MiningEarningsChart, Daylight variant)
 * - FactoryStatusCard (worker health + per-pool breakdown)
 *
 * Layout (guide §6 / §7):
 * - Max content width 1600px (page padding is set by the (auth) layout)
 * - KPI row: 4 columns, 2 columns below 960px
 * - Chart + status side by side, stacked below 960px
 */

import React from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import HourglassBottomOutlinedIcon from "@mui/icons-material/HourglassBottomOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import DashboardHeader from "@/components/DashboardHeader";
import FactoryStatusCard from "@/components/daylight/FactoryStatusCard";
import StatCard from "@/components/daylight/StatCard";
import MiningEarningsChart from "@/components/MiningEarningsChart";
import { useUser } from "@/lib/hooks/useUser";
import { formatValue } from "@/lib/helpers/formatValue";
import { getDaysInCurrentMonth } from "@/lib/helpers/getDaysInCurrentMonth";
import { useSubaccountFilter } from "@/lib/contexts/subaccountFilter-context";
import { MQ, RADIUS_CARD, focusRing, useDaylight } from "@/lib/daylight";

type ChartMode = "total" | "luxor" | "braiins" | "sideBySide";
type Granularity = "daily" | "monthly";

/** Daylight segmented control (Daily / Monthly). */
function Segmented({
  value,
  onChange,
}: {
  value: Granularity;
  onChange: (next: Granularity) => void;
}) {
  const { d, fonts } = useDaylight();
  const options: { id: Granularity; label: string; title: string }[] = [
    { id: "daily", label: "Daily", title: "Show the last 31 days" },
    { id: "monthly", label: "Monthly", title: "Show every fully-closed month" },
  ];

  return (
    <Box
      role="group"
      aria-label="Chart granularity"
      sx={{
        display: "inline-flex",
        gap: "3px",
        p: "3px",
        border: `1px solid ${d.border}`,
        borderRadius: "8px",
        bgcolor: d.canvas,
      }}
    >
      {options.map((o) => {
        const selected = value === o.id;
        return (
          <Box
            component="button"
            type="button"
            key={o.id}
            title={o.title}
            aria-pressed={selected}
            onClick={() => onChange(o.id)}
            sx={{
              border: 0,
              borderRadius: "5px",
              cursor: "pointer",
              px: "12px",
              minHeight: 32,
              fontFamily: fonts.body,
              fontSize: 11,
              fontWeight: selected ? 650 : 500,
              bgcolor: selected ? d.surface : "transparent",
              color: selected ? d.action : d.muted,
              boxShadow: selected ? `0 1px 4px ${d.border}` : "none",
              "&:hover": { color: d.action },
              "&:focus-visible": focusRing(d.action),
              [MQ.mobile]: { minHeight: 44, px: "14px" },
            }}
          >
            {o.label}
          </Box>
        );
      })}
    </Box>
  );
}

/** Daylight tab (pool selector): soft-blue when active. */
function PoolTab({
  active,
  onClick,
  title,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  dot?: string;
  children: React.ReactNode;
}) {
  const { d, fonts } = useDaylight();
  return (
    <Box
      component="button"
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        border: 0,
        borderRadius: "7px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        px: "12px",
        minHeight: 40,
        fontFamily: fonts.body,
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        bgcolor: active ? d.skySoft : "transparent",
        color: active ? d.action : d.muted,
        "&:hover": { bgcolor: active ? d.skySoft : d.hover },
        "&:focus-visible": focusRing(d.action),
        [MQ.mobile]: { minHeight: 44, px: "10px", fontSize: 10 },
      }}
    >
      {dot && (
        <Box
          component="span"
          aria-hidden
          sx={{ width: 7, height: 7, borderRadius: "2px", bgcolor: dot }}
        />
      )}
      {children}
    </Box>
  );
}

export default function DashboardPage() {
  const { loading, error } = useUser();
  const { queryParam: subaccountsParam } = useSubaccountFilter();
  const theme = useTheme();
  const { d, fonts } = useDaylight();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [balance, setBalance] = React.useState<number>(0);
  const [balanceLoading, setBalanceLoading] = React.useState(true);
  const [dailyCost, setDailyCost] = React.useState<number>(0);
  const [dailyCostLoading, setDailyCostLoading] = React.useState(true);
  const [minersSummary, setMinersSummary] = React.useState<{
    activePoolNames: string[];
    pools: {
      luxor: { miners: number };
      braiins: { miners: number };
    };
  }>({
    activePoolNames: [],
    pools: {
      luxor: { miners: 0 },
      braiins: { miners: 0 },
    },
  });
  const [minersSummaryLoading, setMinersSummaryLoading] = React.useState(true);

  // Workers stats state
  const [workersStats, setWorkersStats] = React.useState<{
    activeWorkers: number;
    inactiveWorkers: number;
    activePoolNames: string[];
    poolBreakdown?: {
      luxor: { activeWorkers: number; inactiveWorkers: number };
      braiins: { activeWorkers: number; inactiveWorkers: number };
    };
  }>({
    activeWorkers: 0,
    inactiveWorkers: 0,
    activePoolNames: [],
  });
  const [workersLoading, setWorkersLoading] = React.useState(true);
  const [workersError, setWorkersError] = React.useState<string | null>(null);

  // Chart view mode state
  const [chartMode, setChartMode] = React.useState<ChartMode>("total");

  // Mining Performance chart granularity: daily (last 31 days) or monthly
  // (every fully-closed calendar month since data began).
  const [granularity, setGranularity] = React.useState<Granularity>("daily");

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

  // Fetch balance on component mount
  React.useEffect(() => {
    const fetchBalance = async () => {
      try {
        setBalanceLoading(true);
        const response = await fetch("/api/user/balance", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

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

    fetchBalance();
  }, []);

  // Fetch daily costs on component mount
  React.useEffect(() => {
    const fetchDailyCosts = async () => {
      try {
        setDailyCostLoading(true);
        const response = await fetch("/api/miners/daily-costs", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          console.error("Failed to fetch daily costs");
          setDailyCost(0);
          return;
        }

        const data = await response.json();
        setDailyCost(data.totalDailyCost || 0);
      } catch (err) {
        console.error("Error fetching daily costs:", err);
        setDailyCost(0);
      } finally {
        setDailyCostLoading(false);
      }
    };

    fetchDailyCosts();
  }, []);

  // Fetch workers stats on component mount
  React.useEffect(() => {
    const fetchWorkersStats = async () => {
      try {
        setWorkersLoading(true);
        setWorkersError(null);

        const response = await fetch(
          `/api/workers/stats?subaccounts=${subaccountsParam}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch workers stats");
        }

        if (data.success) {
          setWorkersStats({
            activeWorkers: data.data.activeWorkers || 0,
            inactiveWorkers: data.data.inactiveWorkers || 0,
            activePoolNames: data.data.activePoolNames || [],
            poolBreakdown: data.data.poolBreakdown,
          });
          // Reset chart mode if not applicable
          if (
            data.data.activePoolNames &&
            !data.data.activePoolNames.includes("Luxor") &&
            chartMode === "luxor"
          ) {
            setChartMode("total");
          }
          if (
            data.data.activePoolNames &&
            !data.data.activePoolNames.includes("Braiins") &&
            chartMode === "braiins"
          ) {
            setChartMode("total");
          }
        } else {
          throw new Error(data.error || "Failed to fetch workers");
        }
      } catch (err) {
        console.error("Error fetching workers stats:", err);
        setWorkersError(
          err instanceof Error ? err.message : "Failed to fetch workers",
        );
        setWorkersStats({
          activeWorkers: 0,
          inactiveWorkers: 0,
          activePoolNames: [],
        });
      } finally {
        setWorkersLoading(false);
      }
    };

    fetchWorkersStats();
  }, [subaccountsParam]);

  // Fetch miner summary counts on component mount
  React.useEffect(() => {
    const fetchMinersSummary = async () => {
      try {
        setMinersSummaryLoading(true);

        const response = await fetch(
          `/api/miners/summary?subaccounts=${subaccountsParam}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch miners summary");
        }

        if (data.success) {
          setMinersSummary({
            activePoolNames: data.data.activePoolNames || [],
            pools: {
              luxor: { miners: data.data.pools?.luxor?.miners || 0 },
              braiins: { miners: data.data.pools?.braiins?.miners || 0 },
            },
          });
        }
      } catch (err) {
        console.error("Error fetching miners summary:", err);
        setMinersSummary({
          activePoolNames: [],
          pools: {
            luxor: { miners: 0 },
            braiins: { miners: 0 },
          },
        });
      } finally {
        setMinersSummaryLoading(false);
      }
    };

    fetchMinersSummary();
  }, [subaccountsParam]);

  const hosted = {
    runningCount: workersStats.activeWorkers,
    errorCount: workersStats.inactiveWorkers,
  };

  const showTotalMinersHeading =
    minersSummary.activePoolNames.includes("Luxor") &&
    minersSummary.activePoolNames.includes("Braiins");

  const combinedMinerCount =
    minersSummary.pools.luxor.miners + minersSummary.pools.braiins.miners;

  const marketplace = {
    runningCount: 0,
    comingSoon: true,
  };

  const handleRefreshWorkers = async () => {
    try {
      setWorkersLoading(true);
      setWorkersError(null);

      const response = await fetch(
        `/api/workers/stats?subaccounts=${subaccountsParam}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch workers stats");
      }

      const data = await response.json();

      if (data.success) {
        setWorkersStats({
          activeWorkers: data.data.activeWorkers || 0,
          inactiveWorkers: data.data.inactiveWorkers || 0,
          activePoolNames: data.data.activePoolNames || [],
          poolBreakdown: data.data.poolBreakdown,
        });
        // Reset chart mode if not applicable
        if (
          data.data.activePoolNames &&
          !data.data.activePoolNames.includes("Luxor") &&
          chartMode === "luxor"
        ) {
          setChartMode("total");
        }
        if (
          data.data.activePoolNames &&
          !data.data.activePoolNames.includes("Braiins") &&
          chartMode === "braiins"
        ) {
          setChartMode("total");
        }
      } else {
        throw new Error(data.error || "Failed to fetch workers");
      }
    } catch (err) {
      console.error("Error refreshing workers stats:", err);
      setWorkersError(
        err instanceof Error ? err.message : "Failed to refresh workers",
      );
    } finally {
      setWorkersLoading(false);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  const statsLoading = balanceLoading || dailyCostLoading;

  return (
    <Box
      sx={{
        maxWidth: 1600,
        mx: "auto",
        fontFamily: fonts.body,
        color: d.text,
      }}
    >
      {/* Page heading */}
      <DashboardHeader daylight />

      {/* KPI cards - 4 columns, 2 below 960px */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          [MQ.stack]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
          gap: { xs: "10px", sm: "16px" },
          mb: { xs: "18px", sm: "22px" },
        }}
      >
        <StatCard
          title="Balance"
          value={formatValue(balance, "currency")}
          caption="Available balance"
          tone="sky"
          icon={<AccountBalanceWalletOutlinedIcon />}
          isLoading={balanceLoading}
        />
        <StatCard
          title="Daily cost"
          value={formatValue(dailyCost, "currency")}
          caption="Charged per day"
          tone="amber"
          icon={<PaidOutlinedIcon />}
          isLoading={dailyCostLoading}
        />
        <StatCard
          title="Estimated mining days left"
          value={daysLeft}
          unit={daysLeft === 1 ? "day" : "days"}
          caption="At your current daily cost"
          tone="mint"
          icon={<HourglassBottomOutlinedIcon />}
          isLoading={statsLoading}
        />
        <StatCard
          title="Estimated monthly cost"
          value={formatValue(estimatedMonthlyCost, "currency")}
          caption={`Based on ${getDaysInCurrentMonth()} days this month`}
          tone="amber"
          icon={<CalendarMonthOutlinedIcon />}
          isLoading={dailyCostLoading}
        />
      </Box>

      {/* Main grid: Mining Performance + Factory Status */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 300px",
          [MQ.compact]: { gridTemplateColumns: "minmax(0, 1fr) 260px" },
          [MQ.stack]: { gridTemplateColumns: "minmax(0, 1fr)" },
          gap: { xs: "18px", md: "20px" },
        }}
      >
        {/* Chart card */}
        <Box
          component="section"
          aria-labelledby="mining-performance-title"
          sx={{
            minWidth: 0,
            bgcolor: d.surface,
            border: `1px solid ${d.border}`,
            borderRadius: RADIUS_CARD,
            boxShadow: d.shadow,
            pb: { xs: "6px", sm: "10px" },
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "12px",
              p: { xs: "19px 18px 0", sm: "23px 24px 0" },
            }}
          >
            <Box>
              <Typography
                id="mining-performance-title"
                component="h2"
                sx={{
                  fontFamily: fonts.heading,
                  fontWeight: 750,
                  fontSize: { xs: 16, sm: 18 },
                  letterSpacing: "-.035em",
                  color: d.text,
                }}
              >
                Mining Performance
              </Typography>
              <Typography
                sx={{
                  fontSize: { xs: 10, sm: 11 },
                  color: d.muted,
                  mt: "4px",
                }}
              >
                Revenue in BTC
              </Typography>
            </Box>

            <Segmented value={granularity} onChange={setGranularity} />
          </Box>

          {/* Pool selector - only when the customer has more than one pool */}
          {workersStats.activePoolNames.length > 1 && (
            <Box
              role="group"
              aria-label="Pool filter"
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
                px: { xs: "12px", sm: "18px" },
                pt: "14px",
              }}
            >
              <PoolTab
                active={chartMode === "total"}
                onClick={() => setChartMode("total")}
                title="Show total earnings from all pools"
              >
                All Pools
              </PoolTab>

              {workersStats.activePoolNames.includes("Luxor") && (
                <PoolTab
                  active={chartMode === "luxor"}
                  onClick={() => setChartMode("luxor")}
                  title="Show Luxor pool earnings only"
                  dot={d.poolLuxor}
                >
                  Luxor
                </PoolTab>
              )}

              {workersStats.activePoolNames.includes("Braiins") && (
                <PoolTab
                  active={chartMode === "braiins"}
                  onClick={() => setChartMode("braiins")}
                  title="Show Braiins pool earnings only"
                  dot={d.poolBraiins}
                >
                  Braiins
                </PoolTab>
              )}

              <PoolTab
                active={chartMode === "sideBySide"}
                onClick={() => setChartMode("sideBySide")}
                title="Show side-by-side comparison of both pools"
              >
                Side by Side
              </PoolTab>
            </Box>
          )}

          <MiningEarningsChart
            daylight
            height={isMobile ? 300 : 340}
            days={31}
            viewMode={chartMode}
            granularity={granularity}
          />
        </Box>

        {/* Factory status */}
        <FactoryStatusCard
          runningCount={hosted.runningCount}
          errorCount={hosted.errorCount}
          activePoolNames={workersStats.activePoolNames}
          poolBreakdown={workersStats.poolBreakdown}
          totalMinerCount={
            showTotalMinersHeading ? combinedMinerCount : undefined
          }
          loading={workersLoading}
          error={workersError}
          onRefresh={handleRefreshWorkers}
        />
      </Box>
    </Box>
  );
}
