"use client";
//src/app/(manage)/adminpanel/page.tsx
import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminValueCard from "@/components/admin/AdminValueCard";
import { Box, CircularProgress, Alert, useTheme } from "@mui/material";
import { useVendorInvoices } from "@/lib/hooks/useVendorInvoices";

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

export default function AdminDashboard() {
  const router = useRouter();
  const theme = useTheme();
  const [poolMode, setPoolMode] = useState<"total" | "luxor" | "braiins">("total");

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
  const vendorInvoicesTotalAmount = Number(
    vendorInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
  );

  const hostingProfit = hostingRevenueData?.hostingRevenue
    ? hostingRevenueData.hostingRevenue - vendorInvoicesTotalAmount
    : 0;

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
      "Monthly Revenue (30 days)",
      "Total Customer Balance",
      "Total Customers",
      "Hosting Revenue (Electricity)",
      "Hosting Cost",
      "Hosting Profit",
      "Positive Customer Balance",
      "Negative Customer Balance",
      "Positive Balance Customers",
      "Negative Balance Customers",
    ];

    // Single pool mode - use that pool's color
    if (poolMode === "luxor") return "#1565C0"; // Blue
    if (poolMode === "braiins") return "#FFA500"; // Orange

    // "All Pools" mode - determine by data source
    if (luxorOnlyCards.includes(cardTitle)) return "#1565C0"; // Blue - Luxor only
    if (braiinsOnlyCards.includes(cardTitle)) return "#FFA500"; // Orange - Braiins only
    if (dbOnlyCards.includes(cardTitle)) return "#757575"; // Gray - DB only

    // Default to purple for cards with data from BOTH pools
    return "#9C27B0"; // Purple - combined/aggregated
  };

  // Check if a card should be hidden for Braiins mode
  const shouldHideForBraiins = (cardTitle: string): boolean => {
    const hiddenCards = [
      "Total Pool Accounts",
      "Active Pool Accounts",
      "Inactive Pool Accounts",
      "Uptime (24 hours)",
    ];
    return poolMode === "braiins" && hiddenCards.includes(cardTitle);
  };

  const poolStats = useMemo(() => getPoolStats(poolMode), [poolMode, stats]);
  const minersStats = useMemo(
    () => getMinersStats(poolMode),
    [poolMode, stats?.miners],
  );

  if (loading || customerBalanceLoading || hostingRevenueLoading) {
    return (
      <Box
        sx={{
          p: 4,
          backgroundColor: "#f5f5f7",
          minHeight: "calc(100vh - 64px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Box
        sx={{
          p: 4,
          backgroundColor: "#f5f5f7",
          minHeight: "calc(100vh - 64px)",
        }}
      >
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error?.message || "An error occurred"}
          </Alert>
        )}

        {/* Pool Mode Toggle Buttons */}
        <Box
          sx={{
            display: "flex",
            gap: 2,
            mb: 4,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => setPoolMode("total")}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontWeight: poolMode === "total" ? 600 : 400,
              backgroundColor:
                poolMode === "total"
                  ? "#9C27B0"
                  : theme.palette.mode === "dark"
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.05)",
              color:
                poolMode === "total"
                  ? "#FFFFFF"
                  : theme.palette.text.primary,
              transition: "all 0.2s",
            }}
          >
            All Pools
          </button>

          <button
            onClick={() => setPoolMode("luxor")}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontWeight: poolMode === "luxor" ? 600 : 400,
              backgroundColor:
                poolMode === "luxor"
                  ? "#1565C0"
                  : theme.palette.mode === "dark"
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.05)",
              color:
                poolMode === "luxor"
                  ? "#FFFFFF"
                  : theme.palette.text.primary,
              transition: "all 0.2s",
            }}
          >
            🔷 Luxor
          </button>

          <button
            onClick={() => setPoolMode("braiins")}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontWeight: poolMode === "braiins" ? 600 : 400,
              backgroundColor:
                poolMode === "braiins"
                  ? "#FFA500"
                  : theme.palette.mode === "dark"
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.05)",
              color:
                poolMode === "braiins"
                  ? "#FFFFFF"
                  : theme.palette.text.primary,
              transition: "all 0.2s",
            }}
          >
            🟧 Braiins
          </button>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(2, 1fr)",
              lg: "repeat(4, 1fr)",
            },
            gap: { xs: 2, sm: 3 },
            maxWidth: { sm: "100%", lg: 1400 },
            mx: "auto",
          }}
        >
          {/* === LOCAL INFRASTRUCTURE STATS === */}

          {/* Miners Card */}
          <AdminStatCard
            title="Miners"
            borderColor={getCardBorderColor("Miners")}
            stats={[
              {
                label: "Active",
                value: minersStats.active,
                color: "#2196F3",
              },
              {
                label: "Inactive",
                value: minersStats.inactive,
                color: "#B0BEC5",
              },
              {
                label: "Review",
                value: minersStats.actionRequired,
                color: "#FF5722",
              },
            ]}
          />

          {/* Spaces Card */}
          <AdminStatCard
            title="Spaces"
            borderColor="#757575"
            stats={[
              {
                label: "Free",
                value: stats?.spaces.free ?? 0,
                color: "#9C27B0",
              },
              {
                label: "Used",
                value: stats?.spaces.used ?? 0,
                color: "#673AB7",
              },
            ]}
          />

          {/* Customers Card - Local DB */}
          <AdminStatCard
            title="Customers"
            borderColor="#757575"
            stats={[
              {
                label: "Active",
                value: stats?.customers.active ?? 0,
                color: "#EC407A",
              },
              {
                label: "Inactive",
                value: stats?.customers.inactive ?? 0,
                color: "#B0BEC5",
              },
            ]}
          />

          {/* Power Card - DB-only (independent of pool) */}
          <AdminStatCard
            title="Power"
            borderColor="#757575"
            stats={[
              {
                label: "Free kW",
                value: poolStats?.power.availablePower ?? 0,
                color: "#00C853",
              },
              {
                label: "Used kW",
                value: poolStats?.power.usedPower ?? 0,
                color: "#00B0FF",
              },
            ]}
          />

          {/* === LUXOR POOL STATS === */}

          {/* Monthly Revenue - From Cost Payments */}
          <AdminValueCard
            title="Monthly Revenue (30 days)"
            borderColor="#757575"
            value={stats?.financial.monthlyRevenue ?? 0}
            type="currency"
          />

          {/* Total Customer Balance, from our database */}
          <AdminValueCard
            title="Total Customer Balance"
            borderColor="#757575"
            value={stats?.financial.totalCustomerBalance ?? 0}
            type="currency"
          />

          {/* Total Mined Revenue - Available from both Luxor and Braiins */}
          <AdminValueCard
            title="Total Mined Revenue"
            borderColor={getCardBorderColor("Total Mined Revenue")}
            value={poolStats?.minedRevenue ?? 0}
            type="BTC"
          />

          {/* Uptime 24h - From Luxor, hidden for Braiins */}
          {!shouldHideForBraiins("Uptime (24 hours)") && (
            <AdminValueCard
              title="Uptime (24 hours)"
              borderColor={getCardBorderColor("Uptime (24 hours)")}
              value={`${(poolStats?.uptime_24h ?? 0).toFixed(2)}%`}
            />
          )}

          {/* Hashrate 5 min - Available from both Luxor and Braiins */}
          <AdminValueCard
            title="Hashrate (5 min)"
            borderColor={getCardBorderColor("Hashrate (5 min)")}
            value={poolStats?.hashrate_5m ?? 0}
            subtitle="PH/s"
          />

          {/* Hashrate 24h - Available from both Luxor and Braiins */}
          <AdminValueCard
            title="Hashrate (24 hours)"
            borderColor={getCardBorderColor("Hashrate (24 hours)")}
            value={poolStats?.hashrate_24h ?? 0}
            subtitle="PH/s"
          />

          {/* === LUXOR POOL ACCOUNTS === */}

          {/* Total Pool Accounts - Luxor only, Hidden for Braiins */}
          {!shouldHideForBraiins("Total Pool Accounts") && (
            <AdminValueCard
              title="Total Pool Accounts"
              borderColor={getCardBorderColor("Total Pool Accounts")}
              value={stats?.luxor.poolAccounts.total ?? 0}
            />
          )}

          {/* Active Pool Accounts - Luxor only, Hidden for Braiins */}
          {!shouldHideForBraiins("Active Pool Accounts") && (
            <AdminValueCard
              title="Active Pool Accounts"
              borderColor={getCardBorderColor("Active Pool Accounts")}
              value={stats?.luxor.poolAccounts.active ?? 0}
            />
          )}

          {/* Inactive Pool Accounts - Luxor only, Hidden for Braiins */}
          {!shouldHideForBraiins("Inactive Pool Accounts") && (
            <AdminValueCard
              title="Inactive Pool Accounts"
              borderColor={getCardBorderColor("Inactive Pool Accounts")}
              value={stats?.luxor.poolAccounts.inactive ?? 0}
            />
          )}

          {/* === WORKER STATISTICS FROM LUXOR === */}

          {/* Total Workers - Available from both Luxor and Braiins */}
          <AdminValueCard
            title={poolMode === "braiins" ? "Total Workers (Braiins)" : poolMode === "total" ? "Total Workers" : "Total Workers (Luxor)"}
            borderColor={getCardBorderColor("Total Workers")}
            value={poolStats?.workers.totalWorkers ?? 0}
          />

          {/* Active Workers - Available from both Luxor and Braiins */}
          <AdminValueCard
            title={poolMode === "braiins" ? "Active Workers (Braiins)" : poolMode === "total" ? "Active Workers" : "Active Workers (Luxor)"}
            borderColor={getCardBorderColor("Active Workers")}
            value={poolStats?.workers.activeWorkers ?? 0}
          />

          {/* Inactive Workers - Available from both Luxor and Braiins */}
          <AdminValueCard
            title={poolMode === "braiins" ? "Inactive Workers (Braiins)" : poolMode === "total" ? "Inactive Workers" : "Inactive Workers (Luxor)"}
            borderColor={getCardBorderColor("Inactive Workers")}
            value={poolStats?.workers.inactiveWorkers ?? 0}
          />

          {/* === CUSTOMER FINANCIAL METRICS === */}

          {/* Total Customers Count */}
          <AdminValueCard
            title="Total Customers"
            borderColor="#757575"
            value={stats?.customers.total ?? 0}
          />

          {/* === RESERVED FOR FUTURE LUXOR ENDPOINTS === */}

          {/* Hosting Revenue - From Cost Payments */}
          <AdminValueCard
            title="Hosting Revenue (Electricity)"
            borderColor="#757575"
            value={hostingRevenueData?.hostingRevenue ?? 0}
            type="currency"
          />

          {/* Hosting Cost - implemented */}
          <AdminValueCard
            title="Hosting Cost"
            borderColor="#757575"
            value={vendorInvoicesTotalAmount}
            type="currency"
          />

          {/* Hosting Profit - implemented */}
          <AdminValueCard
            title="Hosting Profit"
            borderColor="#757575"
            value={hostingProfit}
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
            title="Positive Customer Balance"
            borderColor="#757575"
            value={customerBalanceData?.totalPositiveBalance ?? 0}
            type="currency"
          />

          {/* Negative Balance - Aggregated from customer payments */}
          <AdminValueCard
            title="Negative Customer Balance"
            borderColor="#757575"
            value={customerBalanceData?.totalNegativeBalance ?? 0}
            type="currency"
          />

          {/* Positive Balance Customers Count */}
          <AdminValueCard
            title="Positive Balance Customers"
            borderColor="#757575"
            value={customerBalanceData?.positiveCustomerCount ?? 0}
            onClick={() => router.push("/customers/overview?balanceFilter=> 0")}
          />

          {/* Negative Balance Customers Count */}
          <AdminValueCard
            title="Negative Balance Customers"
            borderColor="#757575"
            value={customerBalanceData?.negativeCustomerCount ?? 0}
            onClick={() => router.push("/customers/overview?balanceFilter=< 0")}
          />
        </Box>

        {/* === WARNINGS AND NOTES === */}
        {stats?.warnings && stats.warnings.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Alert severity="warning">
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
    </>
  );
}
