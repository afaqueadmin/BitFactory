"use client";
//src/app/(manage)/adminpanel/page.tsx
import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminValueCard from "@/components/admin/AdminValueCard";
import AdminWelcome from "@/components/admin/AdminWelcome";
import { Box, CircularProgress, Alert } from "@mui/material";
import Segmented from "@/components/daylight/Segmented";
import { RADIUS_CONTROL, useDaylight } from "@/lib/daylight";
import { useVendorInvoices } from "@/lib/hooks/useVendorInvoices";
import { useHardwarePurchases } from "@/lib/hooks/useHardwarePurchases";
import { useSecurityDeposits } from "@/lib/hooks/useSecurityDeposits";
import { useInvoices, InvoiceWithDetails } from "@/lib/hooks/useInvoices";

interface PoolData {
  workers: {
    activeWorkers: number;
    inactiveWorkers: number;
    totalWorkers: number;
  };
  hashrate_5m: number;
  hashrate_24h: number;
  uptime_24h: number;
  minedRevenue: number;
}

interface DashboardStats {
  miners: {
    active: number;
    inactive: number;
    actionRequired: number;
    poolBreakdown?: {
      luxor?: {
        active: number;
        inactive: number;
        actionRequired: number;
        dbCount: number;
      };
      braiins?: {
        active: number;
        inactive: number;
        actionRequired: number;
        dbCount: number;
      };
    };
  };
  spaces: {
    free: number;
    used: number;
  };
  customers: {
    total: number;
    active: number;
    inactive: number;
  };
  luxor: PoolData & {
    poolAccounts: {
      total: number;
      active: number;
      inactive: number;
    };
    power: {
      totalPower: number;
      usedPower: number;
      availablePower: number;
    };
  };
  braiins?: PoolData & {
    power: {
      totalPower: number;
      usedPower?: number;
      availablePower: number;
    };
  };
  combined?: PoolData & {
    poolAccounts?: {
      total: number;
      active: number;
      inactive: number;
    };
    power: {
      totalPower: number;
      usedPower?: number;
      availablePower: number;
    };
  };
  financial: {
    totalCustomerBalance: number;
    monthlyRevenue: number;
    totalMinedRevenue: number;
    braiinsMinedRevenue?: number;
    combinedMinedRevenue?: number;
    selfMiningRevenueBtc: number;
    selfMiningLuxorRevenueBtc: number;
    selfMiningBraiinsRevenueBtc: number;
    selfMiningRevenueUsd: number;
    selfMiningHostingCost: number;
    selfMiningProfitUsd: number;
  };
  warnings: string[];
}

interface CustomerBalanceData {
  totalPositiveBalance: number;
  totalNegativeBalance: number;
  positiveCustomerCount: number;
  negativeCustomerCount: number;
  customerBalances: Array<{
    userId: string;
    email: string | null;
    name: string | null;
    balance: number;
  }>;
}

interface HostingRevenueData {
  hostingRevenue: number;
}

interface HardwareRevenueData {
  hardwareRevenue: number;
}

export default function AdminDashboard() {
  const router = useRouter();
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

  const { data: customerBalanceData, isLoading: customerBalanceLoading } =
    useQuery<CustomerBalanceData>({
      queryKey: ["customerBalance"],
      queryFn: async () => {
        const response = await fetch("/api/customer-balance");

        if (!response.ok) {
          throw new Error("Failed to fetch customer balance");
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to fetch customer balance");
        }

        return data.data;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
    });

  const { data: hostingRevenueData, isLoading: hostingRevenueLoading } =
    useQuery<HostingRevenueData>({
      queryKey: ["hostingRevenue"],
      queryFn: async () => {
        const response = await fetch("/api/cost-payments/hostingRevenue");

        if (!response.ok) {
          throw new Error("Failed to fetch hosting revenue");
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to fetch hosting revenue");
        }

        return data;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
    });

  const { vendorInvoices } = useVendorInvoices(1, 100000, undefined);
  const vendorInvoicesTotalAmount = vendorInvoices
    .filter((invoice) => invoice.paymentStatus !== "Cancelled")
    .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);

  const hostingProfit = hostingRevenueData?.hostingRevenue
    ? hostingRevenueData.hostingRevenue - vendorInvoicesTotalAmount
    : 0;

  const { data: hardwareRevenueData, isLoading: hardwareRevenueLoading } =
    useQuery<HardwareRevenueData>({
      queryKey: ["hardwareRevenue"],
      queryFn: async () => {
        const response = await fetch("/api/cost-payments/hardwareRevenue");

        if (!response.ok) {
          throw new Error("Failed to fetch hardware revenue");
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to fetch hardware revenue");
        }

        return data;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
    });

  const { hardwarePurchases } = useHardwarePurchases(1, 100000, undefined);
  // Hardware cost = quantity x unit price + misc on Pending and Paid
  // invoices. The security deposit is part of totalAmount but is refundable,
  // so it is not a cost (it has its own card).
  const hardwarePurchasesTotalAmount = hardwarePurchases
    .filter((invoice) => invoice.paymentStatus !== "Cancelled")
    .reduce(
      (sum, invoice) =>
        sum + Number(invoice.totalAmount) - Number(invoice.securityDeposit),
      0,
    );

  const { data: securityDeposits } = useSecurityDeposits();

  const hardwareProfit = hardwareRevenueData?.hardwareRevenue
    ? hardwareRevenueData.hardwareRevenue - hardwarePurchasesTotalAmount
    : 0;

  const { invoices: hardwareSalesInvoices } = useInvoices(
    1,
    100000,
    undefined,
    undefined,
    "HARDWARE_SALES",
  );
  const { invoices: hardwareRepairInvoices } = useInvoices(
    1,
    100000,
    undefined,
    undefined,
    "HARDWARE_REPAIR",
  );
  const hardwareRevenuePending = [
    ...hardwareSalesInvoices,
    ...hardwareRepairInvoices,
  ]
    .filter((invoice: InvoiceWithDetails) =>
      ["DRAFT", "ISSUED", "OVERDUE"].includes(invoice.status),
    )
    .reduce(
      (sum: number, invoice: InvoiceWithDetails) =>
        sum + Number(invoice.totalAmount),
      0,
    );

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

  // Get miners stats based on pool mode
  const getMinersStats = (
    mode: "total" | "luxor" | "braiins",
  ): {
    active: number;
    inactive: number;
    actionRequired: number;
  } => {
    if (mode === "braiins" && stats?.miners.poolBreakdown?.braiins) {
      return {
        active: stats.miners.poolBreakdown.braiins.active,
        inactive: stats.miners.poolBreakdown.braiins.inactive,
        actionRequired: stats.miners.poolBreakdown.braiins.actionRequired,
      };
    }
    if (mode === "luxor" && stats?.miners.poolBreakdown?.luxor) {
      return {
        active: stats.miners.poolBreakdown.luxor.active,
        inactive: stats.miners.poolBreakdown.luxor.inactive,
        actionRequired: stats.miners.poolBreakdown.luxor.actionRequired,
      };
    }
    // Default to aggregated (total/all pools)
    return {
      active: stats?.miners.active ?? 0,
      inactive: stats?.miners.inactive ?? 0,
      actionRequired: stats?.miners.actionRequired ?? 0,
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

  // Self-mining (segment = SELF_MINING) revenue must be excluded per pool:
  // Luxor mode excludes only Luxor self-mining revenue, Braiins mode excludes
  // only Braiins self-mining revenue, and combined/"total" mode excludes both.
  const totalMinedRevenue = useMemo(() => {
    const baseRevenue = poolStats?.minedRevenue ?? 0;
    let selfMiningRevenueBtc = 0;
    if (poolMode === "braiins") {
      selfMiningRevenueBtc = stats?.financial.selfMiningBraiinsRevenueBtc ?? 0;
    } else if (poolMode === "luxor") {
      selfMiningRevenueBtc = stats?.financial.selfMiningLuxorRevenueBtc ?? 0;
    } else {
      selfMiningRevenueBtc = stats?.financial.selfMiningRevenueBtc ?? 0;
    }
    return Math.max(0, baseRevenue - selfMiningRevenueBtc);
  }, [
    poolStats,
    poolMode,
    stats?.financial.selfMiningRevenueBtc,
    stats?.financial.selfMiningLuxorRevenueBtc,
    stats?.financial.selfMiningBraiinsRevenueBtc,
  ]);

  const minersStats = useMemo(
    () => getMinersStats(poolMode),
    [poolMode, stats?.miners],
  );

  if (
    loading ||
    customerBalanceLoading ||
    hostingRevenueLoading ||
    hardwareRevenueLoading
  ) {
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

            {/* Spaces Card */}
            <AdminStatCard
              daylight
              title="Spaces"
              borderColor={sourceColor.db}
              stats={[
                {
                  label: "Free",
                  value: stats?.spaces.free ?? 0,
                  color: d.success,
                },
                {
                  label: "Used",
                  value: stats?.spaces.used ?? 0,
                  color: d.action,
                },
              ]}
            />

            {/* Customers Card - Local DB */}
            <AdminStatCard
              daylight
              title="Customers"
              borderColor={sourceColor.db}
              stats={[
                {
                  label: "Active",
                  value: stats?.customers.active ?? 0,
                  color: d.success,
                },
                {
                  label: "Inactive",
                  value: stats?.customers.inactive ?? 0,
                  color: d.inputBorder,
                },
              ]}
            />

            {/* Power Card - DB-only (independent of pool) */}
            <AdminStatCard
              daylight
              title="Power"
              borderColor={sourceColor.db}
              stats={[
                {
                  label: "Free kW",
                  value: poolStats?.power.availablePower ?? 0,
                  color: d.success,
                },
                {
                  label: "Used kW",
                  value: poolStats?.power.usedPower ?? 0,
                  color: d.action,
                },
              ]}
            />

            {/* === LUXOR POOL STATS === */}

            {/* Monthly Revenue - From Cost Payments, excludes self-mining users */}
            <AdminValueCard
              daylight
              title="Monthly Customer Billing (30 days)"
              borderColor={sourceColor.db}
              value={stats?.financial.monthlyRevenue ?? 0}
              type="currency"
              infoText="Sum of Electricity Charges and Adjustments (cost payments) from the last 30 days, flipped to a positive value, for hosted customers only. Excludes Payments, Hardware Sales, and customers with segment = SELF_MINING."
              onClick={() => router.push("/admin/monthly-customer-billing")}
            />

            {/* Total Customer Balance, from our database */}
            <AdminValueCard
              daylight
              title="Total Customer Balance"
              borderColor={sourceColor.db}
              value={stats?.financial.totalCustomerBalance ?? 0}
              type="currency"
              infoText="Sum of all Payments, Electricity Charges, and Adjustments (cost payments) across hosted customers, all-time. Excludes Hardware Sales, deleted customers, and customers with segment = SELF_MINING."
              onClick={() => router.push("/admin/customer-balance")}
            />

            {/* Total Customer Mined Revenue - Available from both Luxor and Braiins, excludes self-mining users */}
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

            {/* Uptime 24h - From Luxor, shows N/A for Braiins */}
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

            {/* Hashrate 5 min - Available from both Luxor and Braiins */}
            <AdminValueCard
              daylight
              title="Hashrate (5 min)"
              borderColor={getCardBorderColor("Hashrate (5 min)")}
              value={poolStats?.hashrate_5m ?? 0}
              subtitle="PH/s"
            />

            {/* Hashrate 24h - Available from both Luxor and Braiins */}
            <AdminValueCard
              daylight
              title="Hashrate (24 hours)"
              borderColor={getCardBorderColor("Hashrate (24 hours)")}
              value={poolStats?.hashrate_24h ?? 0}
              subtitle="PH/s"
            />

            {/* === LUXOR POOL ACCOUNTS === */}

            {/* Total Pool Accounts - Luxor only, shows N/A for Braiins */}
            <AdminValueCard
              daylight
              title="Total Pool Accounts"
              borderColor={getCardBorderColor("Total Pool Accounts")}
              value={
                poolMode === "braiins"
                  ? "N/A"
                  : (stats?.luxor.poolAccounts.total ?? 0)
              }
            />

            {/* Active Pool Accounts - Luxor only, shows N/A for Braiins */}
            <AdminValueCard
              daylight
              title="Active Pool Accounts"
              borderColor={getCardBorderColor("Active Pool Accounts")}
              value={
                poolMode === "braiins"
                  ? "N/A"
                  : (stats?.luxor.poolAccounts.active ?? 0)
              }
            />

            {/* Inactive Pool Accounts - Luxor only, shows N/A for Braiins */}
            <AdminValueCard
              daylight
              title="Inactive Pool Accounts"
              borderColor={getCardBorderColor("Inactive Pool Accounts")}
              value={
                poolMode === "braiins"
                  ? "N/A"
                  : (stats?.luxor.poolAccounts.inactive ?? 0)
              }
            />

            {/* === WORKER STATISTICS FROM LUXOR === */}

            {/* Total Workers - Available from both Luxor and Braiins */}
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
              value={poolStats?.workers.totalWorkers ?? 0}
            />

            {/* Active Workers - Available from both Luxor and Braiins */}
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
              value={poolStats?.workers.activeWorkers ?? 0}
            />

            {/* Inactive Workers - Available from both Luxor and Braiins */}
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
              value={poolStats?.workers.inactiveWorkers ?? 0}
            />

            {/* === CUSTOMER FINANCIAL METRICS === */}

            {/* Total Customers Count */}
            <AdminValueCard
              daylight
              title="Total Customers"
              borderColor={sourceColor.db}
              value={stats?.customers.total ?? 0}
            />

            {/* === RESERVED FOR FUTURE LUXOR ENDPOINTS === */}

            {/* Hosting and Colocation - From ELECTRICITY_CHARGES invoices (ISSUED/OVERDUE/PAID) */}
            <AdminValueCard
              daylight
              title="Hosting and Colocation (Invoice)"
              borderColor={sourceColor.db}
              value={hostingRevenueData?.hostingRevenue ?? 0}
              type="currency"
              infoText="Sum of the total amount on all Electricity Charges invoices with status Issued, Overdue, or Paid. Draft, Cancelled, and Refunded invoices are excluded. Includes unpaid and overdue invoices, not just ones customers have actually paid."
            />

            {/* Hosting Cost - implemented */}
            <AdminValueCard
              daylight
              title="Hosting Cost (Invoice)"
              borderColor={sourceColor.db}
              value={vendorInvoicesTotalAmount}
              type="currency"
              infoText="Sum of the total amount on all Vendor Invoices (what Bitfactory owes the hosting vendor), excluding Cancelled ones. Includes both Pending and Paid vendor invoices, not just paid ones."
            />

            {/* Hosting Profit - implemented */}
            <AdminValueCard
              daylight
              title="Hosting Profit (Invoice)"
              borderColor={sourceColor.db}
              value={hostingProfit}
              type="currency"
              infoText="Hosting and Colocation (Invoice) minus Hosting Cost (Invoice) — what customers were invoiced for hosting minus what the vendor invoiced Bitfactory for the same, regardless of whether either invoice has actually been paid yet."
            />

            {/* Hardware Revenue - From Cost Payments (HARDWARE_SALES + HARDWARE_REPAIR payments) */}
            <AdminValueCard
              daylight
              title="Hardware Revenue"
              borderColor={sourceColor.db}
              value={hardwareRevenueData?.hardwareRevenue ?? 0}
              type="currency"
              infoText="Sum of all payments recorded against Hardware Sales and Hardware Repair invoices, minus issued Hardware credit memos."
            />

            {/* Hardware Revenue Pending - HARDWARE_SALES + HARDWARE_REPAIR invoices not yet paid (DRAFT/ISSUED/OVERDUE) */}
            <AdminValueCard
              daylight
              title="Hardware Revenue Pending"
              borderColor={sourceColor.db}
              value={hardwareRevenuePending}
              type="currency"
              infoText="Sum of the total amount on all Hardware Sales and Hardware Repair invoices with status Draft, Issued, or Overdue."
            />

            {/* Hardware Cost - From Hardware Purchase Invoices */}
            <AdminValueCard
              daylight
              title="Hardware Cost"
              borderColor={sourceColor.db}
              value={hardwarePurchasesTotalAmount}
              type="currency"
              infoText="Quantity × unit price plus miscellaneous charges on all Hardware Purchase invoices that are Pending or Paid (Cancelled ones excluded). Security deposits are not included; see the Security Deposit card."
            />

            {/* Security Deposit - held by vendors, from Hardware Purchase invoices */}
            <AdminValueCard
              daylight
              title="Security Deposit"
              borderColor={sourceColor.db}
              value={securityDeposits?.totals.outstanding ?? 0}
              type="currency"
              onClick={() => router.push("/accounting/security-deposits")}
              infoText="Security deposits on Pending and Paid Hardware Purchase invoices, minus what vendors have returned or applied to their invoices. Click for the breakdown by vendor."
            />

            {/* Hardware Profit - Hardware Revenue minus Hardware Cost */}
            <AdminValueCard
              daylight
              title="Hardware Profit"
              borderColor={sourceColor.db}
              value={hardwareProfit}
              type="currency"
            />

            {/* Est Monthly Hosting Revenue - Not yet implemented */}
            {/*<AdminValueCard title="Est Monthly Hosting Revenue" value="N/A" />*/}

            {/* Est Monthly Hosting Profit - Not yet implemented */}
            {/*<AdminValueCard title="Est Monthly Hosting Profit" value="N/A" />*/}

            {/* Est Yearly Hosting Revenue - Not yet implemented */}
            {/*<AdminValueCard title="Est Yearly Hosting Revenue" value="N/A" />*/}

            {/* Est Yearly Hosting Profit - Not yet implemented */}
            {/*<AdminValueCard title="Est Yearly Hosting Profit" value="N/A" />*/}

            {/* Positive Balance - Aggregated from customer payments */}
            <AdminValueCard
              daylight
              title="Positive Customer Balance"
              borderColor={sourceColor.db}
              value={customerBalanceData?.totalPositiveBalance ?? 0}
              type="currency"
            />

            {/* Negative Balance - Aggregated from customer payments */}
            <AdminValueCard
              daylight
              title="Negative Customer Balance"
              borderColor={sourceColor.db}
              value={customerBalanceData?.totalNegativeBalance ?? 0}
              type="currency"
            />

            {/* Positive Balance Customers Count */}
            <AdminValueCard
              daylight
              title="Positive Balance Customers"
              borderColor={sourceColor.db}
              value={customerBalanceData?.positiveCustomerCount ?? 0}
              onClick={() =>
                router.push("/customers/overview?balanceFilter=> 0")
              }
            />

            {/* Negative Balance Customers Count */}
            <AdminValueCard
              daylight
              title="Negative Balance Customers"
              borderColor={sourceColor.db}
              value={customerBalanceData?.negativeCustomerCount ?? 0}
              onClick={() =>
                router.push("/customers/overview?balanceFilter=< 0")
              }
            />

            {/* Self Mining Revenue (BTC) - always Luxor + Braiins combined; only shown on "All Pools" filter */}
            {poolMode === "total" && (
              <AdminValueCard
                daylight
                title="Self Mining Revenue (BTC)"
                borderColor={sourceColor.combined}
                value={stats?.financial.selfMiningRevenueBtc ?? 0}
                type="BTC"
                infoText="Combined all-time BTC mined for customers with segment = SELF_MINING (e.g. Higgs Self Mining), across both pools: Luxor (since 2025-01-01) plus Braiins (all-time reward)."
              />
            )}

            {/* Self Mining Revenue (USD) - always Luxor + Braiins combined; only shown on "All Pools" filter */}
            {poolMode === "total" && (
              <AdminValueCard
                daylight
                title="Self Mining Revenue (USD)"
                borderColor={sourceColor.combined}
                value={stats?.financial.selfMiningRevenueUsd ?? 0}
                type="currency"
                infoText="Self Mining Revenue (BTC) multiplied by the current BTC/USD market price (live from Binance)."
              />
            )}

            {/* Self Mining Hosting Cost - electricity invoices issued to SELF_MINING users; a DB value, not pool-specific, always visible */}
            <AdminValueCard
              daylight
              title="Self Mining Hosting Cost"
              borderColor={sourceColor.db}
              value={stats?.financial.selfMiningHostingCost ?? 0}
              type="currency"
              infoText="Sum of all issued Electricity Charges invoices (status not Draft) for customers with segment = SELF_MINING. Excludes Hardware Sales invoices. This is a single DB total and does not change with the pool filter."
            />

            {/* Self Mining Profit - always combined USD revenue minus hosting cost; only shown on "All Pools" filter */}
            {poolMode === "total" && (
              <AdminValueCard
                daylight
                title="Self Mining Profit"
                borderColor={sourceColor.combined}
                value={stats?.financial.selfMiningProfitUsd ?? 0}
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
