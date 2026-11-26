"use client";
//src/app/(manage)/adminpanel/page.tsx
import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminValueCard from "@/components/admin/AdminValueCard";
import AdminWelcome from "@/components/admin/AdminWelcome";
import { useUser } from "@/lib/hooks";
import { can } from "@/lib/auth/can";
import {
  DASHBOARD_CARD_PERMISSIONS,
  type Permission,
} from "@/lib/auth/permissions";
import { Box, CircularProgress, Alert } from "@mui/material";
import Segmented from "@/components/daylight/Segmented";
import { RADIUS_CONTROL, useDaylight } from "@/lib/daylight";

interface PoolData {
  workers?: {
    activeWorkers?: number;
    inactiveWorkers?: number;
    totalWorkers?: number;
  };
  hashrate_5m?: number;
  hashrate_24h?: number;
  uptime_24h?: number;
  power?: {
    totalPower?: number;
    usedPower?: number;
    availablePower?: number;
  };
}

interface MinerCounts {
  active: number;
  inactive: number;
  actionRequired: number;
}

/** GET /api/admin/dashboard: only the sections of the caller's cards. */
interface DashboardStats {
  miners?: MinerCounts & {
    poolBreakdown?: { luxor?: MinerCounts; braiins?: MinerCounts };
  };
  spaces?: { free: number; used: number };
  customers?: { total?: number; active?: number; inactive?: number };
  luxor?: PoolData & {
    poolAccounts?: { total?: number; active?: number; inactive?: number };
  };
  braiins?: PoolData;
  combined?: PoolData;
  financial?: {
    totalCustomerBalance?: number;
    monthlyRevenue?: number;
    selfMiningRevenueBtc?: number;
    selfMiningRevenueUsd?: number;
    selfMiningHostingCost?: number;
    selfMiningProfitUsd?: number;
    customerMinedRevenue?: { total: number; luxor: number; braiins: number };
  };
  balances?: {
    totalPositiveBalance?: number;
    totalNegativeBalance?: number;
    positiveCustomerCount?: number;
    negativeCustomerCount?: number;
  };
  finance?: {
    hostingRevenue?: number;
    hostingCost?: number;
    hostingProfit?: number;
    hardwareRevenue?: number;
    hardwareRevenuePending?: number;
    hardwareCost?: number;
    securityDeposit?: number;
    hardwareProfit?: number;
  };
  warnings: string[];
}

/**
 * /adminpanel is always open to staff (everyone lands here). Each card needs
 * its own dashboard_* permission; the API sends only those cards' figures.
 * With none, only the welcome header shows and no data is requested.
 */
export default function AdminDashboard() {
  const { user, loading } = useUser();
  const { d, fonts } = useDaylight();
  if (loading || !user) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress sx={{ color: d.action }} />
      </Box>
    );
  }
  if (!DASHBOARD_CARD_PERMISSIONS.some((p) => can(user, p))) {
    return (
      <Box
        sx={{
          p: { xs: "24px 16px", sm: "28px 24px", md: "32px 36px" },
          backgroundColor: d.canvas,
          minHeight: "100%",
          fontFamily: fonts.body,
          color: d.text,
        }}
      >
        <Box sx={{ maxWidth: 1400, mx: "auto" }}>
          <AdminWelcome />
          <Box sx={{ mt: 2, color: d.muted }}>
            Use the menu to open the pages you have access to.
          </Box>
        </Box>
      </Box>
    );
  }
  return <DashboardContent />;
}

function DashboardContent() {
  const router = useRouter();
  const { user } = useUser();
  const show = (card: Permission) => can(user, card);
  const { d, fonts } = useDaylight();
  const [poolMode, setPoolMode] = useState<"total" | "luxor" | "braiins">(
    "total",
  );

  const {
    data: stats,
    isLoading: loading,
    error,
  } = useQuery<DashboardStats>({
    queryKey: ["adminDashboard"],
    queryFn: async () => {
      const response = await fetch("/api/admin/dashboard");

      if (!response.ok) {
        throw new Error("Failed to fetch dashboard statistics");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch stats");
      }

      return data.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  // Get pool stats based on poolMode
  const getPoolStats = (mode: "total" | "luxor" | "braiins") => {
    if (mode === "braiins" && stats?.braiins) {
      return stats.braiins;
    }
    if (mode === "total" && stats?.combined) {
      return stats.combined;
    }
    return stats?.luxor; // Default to Luxor
  };

  const getMinersStats = (mode: "total" | "luxor" | "braiins"): MinerCounts => {
    if (mode === "braiins" && stats?.miners?.poolBreakdown?.braiins)
      return stats.miners.poolBreakdown.braiins;
    if (mode === "luxor" && stats?.miners?.poolBreakdown?.luxor)
      return stats.miners.poolBreakdown.luxor;
    // Default to aggregated (total/all pools)
    return {
      active: stats?.miners?.active ?? 0,
      inactive: stats?.miners?.inactive ?? 0,
      actionRequired: stats?.miners?.actionRequired ?? 0,
    };
  };

  // Data-source marker colours (shown on each card and in the legend).
  const sourceColor = {
    db: d.muted,
    combined: d.poolCombined,
    luxor: d.poolLuxor,
    braiins: d.poolBraiins,
  };

  // Get border color based on poolMode and card data source
  const getCardBorderColor = (cardTitle: string): string => {
    // Cards that only have data from ONE pool (show pool color even in "All Pools" mode)
    const luxorOnlyCards = [
      "Uptime (24 hours)",
      "Total Pool Accounts",
      "Active Pool Accounts",
      "Inactive Pool Accounts",
    ];
    const braiinsOnlyCards: string[] = [];

    // DB-only cards (no pool dependency)
    const dbOnlyCards = [
      "Monthly Customer Billing (30 days)",
      "Total Customer Balance",
      "Total Customers",
      "Hosting and Colocation (Invoice)",
      "Hosting Cost (Invoice)",
      "Hosting Profit (Invoice)",
      "Hardware Revenue",
      "Hardware Revenue Pending",
      "Hardware Cost",
      "Security Deposit",
      "Hardware Profit",
      "Positive Customer Balance",
      "Negative Customer Balance",
      "Positive Balance Customers",
      "Negative Balance Customers",
    ];

    // Single pool mode - use that pool's color
    if (poolMode === "luxor") return sourceColor.luxor;
    if (poolMode === "braiins") return sourceColor.braiins;

    // "All Pools" mode - determine by data source
    if (luxorOnlyCards.includes(cardTitle)) return sourceColor.luxor;
    if (braiinsOnlyCards.includes(cardTitle)) return sourceColor.braiins;
    if (dbOnlyCards.includes(cardTitle)) return sourceColor.db;

    // Cards with data from BOTH pools
    return sourceColor.combined;
  };

  const poolStats = useMemo(() => getPoolStats(poolMode), [poolMode, stats]);

  // Mined revenue net of self-mining, per pool filter (computed on the server).
  const totalMinedRevenue =
    stats?.financial?.customerMinedRevenue?.[poolMode] ?? 0;

  const minersStats = useMemo(
    () => getMinersStats(poolMode),
    [poolMode, stats?.miners],
  );

  if (loading) {
    return (
      <Box
        sx={{
          p: 4,
          backgroundColor: d.canvas,
          minHeight: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <CircularProgress sx={{ color: d.action }} />
      </Box>
    );
  }

  return (
    <>
      <Box
        sx={{
          p: { xs: "24px 16px", sm: "28px 24px", md: "32px 36px" },
          backgroundColor: d.canvas,
          minHeight: "100%",
          fontFamily: fonts.body,
          color: d.text,
        }}
      >
        <Box sx={{ maxWidth: { sm: "100%", lg: 1400 }, mx: "auto" }}>
          {error && (
            <Alert
              severity="error"
              sx={{
                mb: 2.5,
                borderRadius: RADIUS_CONTROL,
                bgcolor: d.dangerSoft,
                color: d.danger,
                fontFamily: fonts.body,
                "& .MuiAlert-icon": { color: d.danger },
              }}
            >
              {error?.message || "An error occurred"}
            </Alert>
          )}

          {/* Title + Data Source Legend + Pool Mode Segmented Control */}
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              alignItems: { xs: "flex-start", md: "flex-end" },
              justifyContent: "space-between",
              gap: 2,
              mb: { xs: "20px", md: "24px" },
            }}
          >
            <AdminWelcome />

            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column-reverse", sm: "row" },
                alignItems: { xs: "flex-start", sm: "center" },
                gap: { xs: 1.5, sm: 2.5 },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: { xs: 1.5, sm: 2 },
                  flexWrap: "wrap",
                }}
              >
                {[
                  { color: sourceColor.db, label: "DB value" },
                  { color: sourceColor.combined, label: "Combined" },
                  { color: sourceColor.luxor, label: "Luxor" },
                  { color: sourceColor.braiins, label: "Braiins" },
                ].map(({ color, label }) => (
                  <Box
                    key={label}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: 11,
                      fontWeight: 500,
                      color: d.muted,
                    }}
                  >
                    <Box
                      aria-hidden
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "2px",
                        bgcolor: color,
                        flexShrink: 0,
                      }}
                    />
                    {label}
                  </Box>
                ))}
              </Box>
              <Segmented
                ariaLabel="Pool"
                value={poolMode}
                onChange={setPoolMode}
                options={[
                  { id: "total", label: "All Pools" },
                  { id: "luxor", label: "Luxor" },
                  { id: "braiins", label: "Braiins" },
                ]}
              />
            </Box>
          </Box>

          <Box
            sx={{
              display: "grid",
              // Columns follow the space the grid actually has (which also
              // changes when the sidebar collapses), not the window width:
              // as many 240px+ columns as fit, capped at 4 so the donut
              // cards always share the first row.
              gridTemplateColumns:
                "repeat(auto-fill, minmax(max(min(240px, 100%), calc((100% - 60px) / 4)), 1fr))",
              gap: { xs: "12px", sm: "16px", md: "20px" },
            }}
          >
            {/* === LOCAL INFRASTRUCTURE STATS === */}

            {/* Miners Card */}
            {show("dashboard_operations.miners") && (
              <AdminStatCard
                daylight
                title="Miners"
                borderColor={getCardBorderColor("Miners")}
                stats={[
                  {
                    label: "Active",
                    value: minersStats.active,
                    color: d.success,
                  },
                  {
                    label: "Inactive",
                    value: minersStats.inactive,
                    color: d.inputBorder,
                  },
                  {
                    label: "Review",
                    value: minersStats.actionRequired,
                    color: d.danger,
                  },
                ]}
              />
            )}

            {/* Spaces Card */}
            {show("dashboard_operations.spaces") && (
              <AdminStatCard
                daylight
                title="Spaces"
                borderColor={sourceColor.db}
                stats={[
                  {
                    label: "Free",
                    value: stats?.spaces?.free ?? 0,
                    color: d.success,
                  },
                  {
                    label: "Used",
                    value: stats?.spaces?.used ?? 0,
                    color: d.action,
                  },
                ]}
              />
            )}

            {/* Customers Card - Local DB */}
            {show("dashboard_customers.customers") && (
              <AdminStatCard
                daylight
                title="Customers"
                borderColor={sourceColor.db}
                stats={[
                  {
                    label: "Active",
                    value: stats?.customers?.active ?? 0,
                    color: d.success,
                  },
                  {
                    label: "Inactive",
                    value: stats?.customers?.inactive ?? 0,
                    color: d.inputBorder,
                  },
                ]}
              />
            )}

            {/* Power Card - DB-only (independent of pool) */}
            {show("dashboard_operations.power") && (
              <AdminStatCard
                daylight
                title="Power"
                borderColor={sourceColor.db}
                stats={[
                  {
                    label: "Free kW",
                    value: poolStats?.power?.availablePower ?? 0,
                    color: d.success,
                  },
                  {
                    label: "Used kW",
                    value: poolStats?.power?.usedPower ?? 0,
                    color: d.action,
                  },
                ]}
              />
            )}

            {/* === LUXOR POOL STATS === */}

            {/* Monthly Revenue - From Cost Payments, excludes self-mining users */}
            {show("dashboard_balances.monthly_billing") && (
              <AdminValueCard
                daylight
                title="Monthly Customer Billing (30 days)"
                borderColor={sourceColor.db}
                value={stats?.financial?.monthlyRevenue ?? 0}
                type="currency"
                infoText="Sum of Electricity Charges and Adjustments (cost payments) from the last 30 days, flipped to a positive value, for hosted customers only. Excludes Payments, Hardware Sales, and customers with segment = SELF_MINING."
                onClick={() => router.push("/admin/monthly-customer-billing")}
              />
            )}

            {/* Total Customer Balance, from our database */}
            {show("dashboard_balances.total_balance") && (
              <AdminValueCard
                daylight
                title="Total Customer Balance"
                borderColor={sourceColor.db}
                value={stats?.financial?.totalCustomerBalance ?? 0}
                type="currency"
                infoText="Sum of all Payments, Electricity Charges, and Adjustments (cost payments) across hosted customers, all-time. Excludes Hardware Sales, deleted customers, and customers with segment = SELF_MINING."
                onClick={() => router.push("/admin/customer-balance")}
              />
            )}

            {/* Total Customer Mined Revenue - Available from both Luxor and Braiins, excludes self-mining users */}
            {show("dashboard_mining.customer_mined_revenue") && (
              <AdminValueCard
                daylight
                title="Total Customer Mined Revenue"
                borderColor={getCardBorderColor("Total Customer Mined Revenue")}
                value={totalMinedRevenue}
                type="BTC"
                infoText={
                  poolMode === "braiins"
                    ? "Total BTC mined on Braiins for hosted customers, all-time. Excludes BTC mined by customers with segment = SELF_MINING (shown separately in the Self Mining Revenue (BTC) card)."
                    : "Total BTC mined since 2025-01-01 across all subaccounts at the site (Luxor" +
                      (poolMode === "total" ? " + Braiins" : "") +
                      "), for hosted customers only. Excludes BTC mined by customers with segment = SELF_MINING (shown separately in the Self Mining Revenue (BTC) card)."
                }
              />
            )}

            {/* Uptime 24h - From Luxor, shows N/A for Braiins */}
            {show("dashboard_operations.uptime") && (
              <AdminValueCard
                daylight
                title="Uptime (24 hours)"
                borderColor={getCardBorderColor("Uptime (24 hours)")}
                value={
                  poolMode === "braiins"
                    ? "N/A"
                    : `${(poolStats?.uptime_24h ?? 0).toFixed(2)}%`
                }
              />
            )}

            {/* Hashrate 5 min - Available from both Luxor and Braiins */}
            {show("dashboard_operations.hashrate_five_min") && (
              <AdminValueCard
                daylight
                title="Hashrate (5 min)"
                borderColor={getCardBorderColor("Hashrate (5 min)")}
                value={poolStats?.hashrate_5m ?? 0}
                subtitle="PH/s"
              />
            )}

            {/* Hashrate 24h - Available from both Luxor and Braiins */}
            {show("dashboard_operations.hashrate_one_day") && (
              <AdminValueCard
                daylight
                title="Hashrate (24 hours)"
                borderColor={getCardBorderColor("Hashrate (24 hours)")}
                value={poolStats?.hashrate_24h ?? 0}
                subtitle="PH/s"
              />
            )}

            {/* === LUXOR POOL ACCOUNTS === */}

            {/* Total Pool Accounts - Luxor only, shows N/A for Braiins */}
            {show("dashboard_customers.total_pool_accounts") && (
              <AdminValueCard
                daylight
                title="Total Pool Accounts"
                borderColor={getCardBorderColor("Total Pool Accounts")}
                value={
                  poolMode === "braiins"
                    ? "N/A"
                    : (stats?.luxor?.poolAccounts?.total ?? 0)
                }
              />
            )}

            {/* Active Pool Accounts - Luxor only, shows N/A for Braiins */}
            {show("dashboard_customers.active_pool_accounts") && (
              <AdminValueCard
                daylight
                title="Active Pool Accounts"
                borderColor={getCardBorderColor("Active Pool Accounts")}
                value={
                  poolMode === "braiins"
                    ? "N/A"
                    : (stats?.luxor?.poolAccounts?.active ?? 0)
                }
              />
            )}

            {/* Inactive Pool Accounts - Luxor only, shows N/A for Braiins */}
            {show("dashboard_customers.inactive_pool_accounts") && (
              <AdminValueCard
                daylight
                title="Inactive Pool Accounts"
                borderColor={getCardBorderColor("Inactive Pool Accounts")}
                value={
                  poolMode === "braiins"
                    ? "N/A"
                    : (stats?.luxor?.poolAccounts?.inactive ?? 0)
                }
              />
            )}

            {/* === WORKER STATISTICS FROM LUXOR === */}

            {/* Total Workers - Available from both Luxor and Braiins */}
            {show("dashboard_operations.total_workers") && (
              <AdminValueCard
                daylight
                title={
                  poolMode === "braiins"
                    ? "Total Workers (Braiins)"
                    : poolMode === "total"
                      ? "Total Workers"
                      : "Total Workers (Luxor)"
                }
                borderColor={getCardBorderColor("Total Workers")}
                value={poolStats?.workers?.totalWorkers ?? 0}
              />
            )}

            {/* Active Workers - Available from both Luxor and Braiins */}
            {show("dashboard_operations.active_workers") && (
              <AdminValueCard
                daylight
                title={
                  poolMode === "braiins"
                    ? "Active Workers (Braiins)"
                    : poolMode === "total"
                      ? "Active Workers"
                      : "Active Workers (Luxor)"
                }
                borderColor={getCardBorderColor("Active Workers")}
                value={poolStats?.workers?.activeWorkers ?? 0}
              />
            )}

            {/* Inactive Workers - Available from both Luxor and Braiins */}
            {show("dashboard_operations.inactive_workers") && (
              <AdminValueCard
                daylight
                title={
                  poolMode === "braiins"
                    ? "Inactive Workers (Braiins)"
                    : poolMode === "total"
                      ? "Inactive Workers"
                      : "Inactive Workers (Luxor)"
                }
                borderColor={getCardBorderColor("Inactive Workers")}
                value={poolStats?.workers?.inactiveWorkers ?? 0}
              />
            )}

            {/* === CUSTOMER FINANCIAL METRICS === */}

            {/* Total Customers Count */}
            {show("dashboard_customers.total_customers") && (
              <AdminValueCard
                daylight
                title="Total Customers"
                borderColor={sourceColor.db}
                value={stats?.customers?.total ?? 0}
              />
            )}

            {/* === RESERVED FOR FUTURE LUXOR ENDPOINTS === */}

            {/* Hosting and Colocation - From ELECTRICITY_CHARGES invoices (ISSUED/OVERDUE/PAID) */}
            {show("dashboard_finance.hosting_revenue") && (
              <AdminValueCard
                daylight
                title="Hosting and Colocation (Invoice)"
                borderColor={sourceColor.db}
                value={stats?.finance?.hostingRevenue ?? 0}
                type="currency"
                infoText="Sum of the total amount on all Electricity Charges invoices with status Issued, Overdue, or Paid. Draft, Cancelled, and Refunded invoices are excluded. Includes unpaid and overdue invoices, not just ones customers have actually paid."
              />
            )}

            {/* Hosting Cost - implemented */}
            {show("dashboard_finance.hosting_cost") && (
              <AdminValueCard
                daylight
                title="Hosting Cost (Invoice)"
                borderColor={sourceColor.db}
                value={stats?.finance?.hostingCost ?? 0}
                type="currency"
                infoText="Sum of the total amount on all Vendor Invoices (what Bitfactory owes the hosting vendor), excluding Cancelled ones. Includes both Pending and Paid vendor invoices, not just paid ones."
              />
            )}

            {/* Hosting Profit - implemented */}
            {show("dashboard_finance.hosting_profit") && (
              <AdminValueCard
                daylight
                title="Hosting Profit (Invoice)"
                borderColor={sourceColor.db}
                value={stats?.finance?.hostingProfit ?? 0}
                type="currency"
                infoText="Hosting and Colocation (Invoice) minus Hosting Cost (Invoice) — what customers were invoiced for hosting minus what the vendor invoiced Bitfactory for the same, regardless of whether either invoice has actually been paid yet."
              />
            )}

            {/* Hardware Revenue - From Cost Payments (HARDWARE_SALES + HARDWARE_REPAIR payments) */}
            {show("dashboard_finance.hardware_revenue") && (
              <AdminValueCard
                daylight
                title="Hardware Revenue"
                borderColor={sourceColor.db}
                value={stats?.finance?.hardwareRevenue ?? 0}
                type="currency"
                infoText="Sum of all payments recorded against Hardware Sales and Hardware Repair invoices, minus issued Hardware credit memos."
              />
            )}

            {/* Hardware Revenue Pending - HARDWARE_SALES + HARDWARE_REPAIR invoices not yet paid (DRAFT/ISSUED/OVERDUE) */}
            {show("dashboard_finance.hardware_revenue_pending") && (
              <AdminValueCard
                daylight
                title="Hardware Revenue Pending"
                borderColor={sourceColor.db}
                value={stats?.finance?.hardwareRevenuePending ?? 0}
                type="currency"
                infoText="Sum of the total amount on all Hardware Sales and Hardware Repair invoices with status Draft, Issued, or Overdue."
              />
            )}

            {/* Hardware Cost - From Hardware Purchase Invoices */}
            {show("dashboard_finance.hardware_cost") && (
              <AdminValueCard
                daylight
                title="Hardware Cost"
                borderColor={sourceColor.db}
                value={stats?.finance?.hardwareCost ?? 0}
                type="currency"
                infoText="Quantity × unit price plus miscellaneous charges on all Hardware Purchase invoices that are Pending or Paid (Cancelled ones excluded). Security deposits are not included; see the Security Deposit card."
              />
            )}

            {/* Security Deposit - held by vendors, from Hardware Purchase invoices */}
            {show("dashboard_finance.security_deposit") && (
              <AdminValueCard
                daylight
                title="Security Deposit"
                borderColor={sourceColor.db}
                value={stats?.finance?.securityDeposit ?? 0}
                type="currency"
                onClick={() => router.push("/accounting/security-deposits")}
                infoText="Security deposits on Pending and Paid Hardware Purchase invoices, minus what vendors have returned or applied to their invoices. Click for the breakdown by vendor."
              />
            )}

            {/* Hardware Profit - Hardware Revenue minus Hardware Cost */}
            {show("dashboard_finance.hardware_profit") && (
              <AdminValueCard
                daylight
                title="Hardware Profit"
                borderColor={sourceColor.db}
                value={stats?.finance?.hardwareProfit ?? 0}
                type="currency"
              />
            )}

            {/* Est Monthly Hosting Revenue - Not yet implemented */}
            {/*<AdminValueCard title="Est Monthly Hosting Revenue" value="N/A" />*/}

            {/* Est Monthly Hosting Profit - Not yet implemented */}
            {/*<AdminValueCard title="Est Monthly Hosting Profit" value="N/A" />*/}

            {/* Est Yearly Hosting Revenue - Not yet implemented */}
            {/*<AdminValueCard title="Est Yearly Hosting Revenue" value="N/A" />*/}

            {/* Est Yearly Hosting Profit - Not yet implemented */}
            {/*<AdminValueCard title="Est Yearly Hosting Profit" value="N/A" />*/}

            {/* Positive Balance - Aggregated from customer payments */}
            {show("dashboard_balances.positive_balance") && (
              <AdminValueCard
                daylight
                title="Positive Customer Balance"
                borderColor={sourceColor.db}
                value={stats?.balances?.totalPositiveBalance ?? 0}
                type="currency"
              />
            )}

            {/* Negative Balance - Aggregated from customer payments */}
            {show("dashboard_balances.negative_balance") && (
              <AdminValueCard
                daylight
                title="Negative Customer Balance"
                borderColor={sourceColor.db}
                value={stats?.balances?.totalNegativeBalance ?? 0}
                type="currency"
              />
            )}

            {/* Positive Balance Customers Count */}
            {show("dashboard_balances.positive_balance_customers") && (
              <AdminValueCard
                daylight
                title="Positive Balance Customers"
                borderColor={sourceColor.db}
                value={stats?.balances?.positiveCustomerCount ?? 0}
                onClick={() =>
                  router.push("/customers/overview?balanceFilter=> 0")
                }
              />
            )}

            {/* Negative Balance Customers Count */}
            {show("dashboard_balances.negative_balance_customers") && (
              <AdminValueCard
                daylight
                title="Negative Balance Customers"
                borderColor={sourceColor.db}
                value={stats?.balances?.negativeCustomerCount ?? 0}
                onClick={() =>
                  router.push("/customers/overview?balanceFilter=< 0")
                }
              />
            )}

            {/* Self Mining Revenue (BTC) - always Luxor + Braiins combined; only shown on "All Pools" filter */}
            {poolMode === "total" &&
              show("dashboard_mining.self_mining_revenue_btc") && (
                <AdminValueCard
                  daylight
                  title="Self Mining Revenue (BTC)"
                  borderColor={sourceColor.combined}
                  value={stats?.financial?.selfMiningRevenueBtc ?? 0}
                  type="BTC"
                  infoText="Combined all-time BTC mined for customers with segment = SELF_MINING (e.g. Higgs Self Mining), across both pools: Luxor (since 2025-01-01) plus Braiins (all-time reward)."
                />
              )}

            {/* Self Mining Revenue (USD) - always Luxor + Braiins combined; only shown on "All Pools" filter */}
            {poolMode === "total" &&
              show("dashboard_mining.self_mining_revenue_usd") && (
                <AdminValueCard
                  daylight
                  title="Self Mining Revenue (USD)"
                  borderColor={sourceColor.combined}
                  value={stats?.financial?.selfMiningRevenueUsd ?? 0}
                  type="currency"
                  infoText="Self Mining Revenue (BTC) multiplied by the current BTC/USD market price (live from Binance)."
                />
              )}

            {/* Self Mining Hosting Cost - electricity invoices issued to SELF_MINING users; a DB value, not pool-specific, always visible */}
            {show("dashboard_mining.self_mining_hosting_cost") && (
              <AdminValueCard
                daylight
                title="Self Mining Hosting Cost"
                borderColor={sourceColor.db}
                value={stats?.financial?.selfMiningHostingCost ?? 0}
                type="currency"
                infoText="Sum of all issued Electricity Charges invoices (status not Draft) for customers with segment = SELF_MINING. Excludes Hardware Sales invoices. This is a single DB total and does not change with the pool filter."
              />
            )}

            {/* Self Mining Profit - always combined USD revenue minus hosting cost; only shown on "All Pools" filter */}
            {poolMode === "total" &&
              show("dashboard_mining.self_mining_profit") && (
                <AdminValueCard
                  daylight
                  title="Self Mining Profit"
                  borderColor={sourceColor.combined}
                  value={stats?.financial?.selfMiningProfitUsd ?? 0}
                  type="currency"
                  infoText="Self Mining Revenue (USD) minus Self Mining Hosting Cost."
                />
              )}
          </Box>

          {/* === WARNINGS AND NOTES === */}
          {stats?.warnings && stats.warnings.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Alert
                severity="warning"
                sx={{
                  borderRadius: RADIUS_CONTROL,
                  bgcolor: d.amber,
                  color: d.warning,
                  border: `1px solid ${d.borderAmber}`,
                  fontFamily: fonts.body,
                  fontSize: 13,
                  "& .MuiAlert-icon": { color: d.warning },
                }}
              >
                <strong>Data Availability Notes:</strong>
                <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                  {stats.warnings.map((warning: string, idx: number) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </Alert>
            </Box>
          )}
        </Box>
      </Box>
    </>
  );
}
