"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminValueCard from "@/components/admin/AdminValueCard";
import { Box, CircularProgress, Alert, useTheme } from "@mui/material";

interface PoolData {
  hashrate_5m: number;
  hashrate_24h: number;
  uptime_24h: number;
  minedRevenue: number;
}

interface MinerPoolCounts {
  active: number;
  inactive: number;
  actionRequired: number;
}

interface FranchiseeDashboardStats {
  customers: {
    total: number;
    active: number;
    inactive: number;
  };
  miners: MinerPoolCounts & {
    poolBreakdown: {
      luxor: MinerPoolCounts;
      braiins: MinerPoolCounts;
    };
  };
  financial: {
    totalCustomerBalance: number;
    monthlyRevenue: number;
  };
  luxor: PoolData;
  braiins: PoolData;
  combined: PoolData;
  warnings: string[];
}

interface CustomerBalanceData {
  totalPositiveBalance: number;
  totalNegativeBalance: number;
  positiveCustomerCount: number;
  negativeCustomerCount: number;
}

export default function FranchiseDashboardPage() {
  const router = useRouter();
  const theme = useTheme();
  const [poolMode, setPoolMode] = React.useState<"total" | "luxor" | "braiins">(
    "total",
  );

  const {
    data: stats,
    isLoading: loading,
    error,
  } = useQuery<FranchiseeDashboardStats>({
    queryKey: ["franchiseDashboard"],
    queryFn: async () => {
      const response = await fetch("/api/franchise/dashboard");

      if (!response.ok) {
        throw new Error("Failed to fetch dashboard statistics");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch stats");
      }

      return data.data;
    },
    staleTime: 5 * 60 * 1000,
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
      staleTime: 5 * 60 * 1000,
      retry: 2,
    });

  // Get pool stats based on poolMode (Uptime/Hashrate/Total Mined Revenue)
  const getPoolStats = (
    mode: "total" | "luxor" | "braiins",
  ): PoolData | undefined => {
    if (mode === "braiins") return stats?.braiins;
    if (mode === "luxor") return stats?.luxor;
    return stats?.combined;
  };

  // Get miners stats based on pool mode
  const getMinersStats = (
    mode: "total" | "luxor" | "braiins",
  ): MinerPoolCounts => {
    if (mode === "braiins" && stats?.miners.poolBreakdown?.braiins) {
      return stats.miners.poolBreakdown.braiins;
    }
    if (mode === "luxor" && stats?.miners.poolBreakdown?.luxor) {
      return stats.miners.poolBreakdown.luxor;
    }
    return {
      active: stats?.miners.active ?? 0,
      inactive: stats?.miners.inactive ?? 0,
      actionRequired: stats?.miners.actionRequired ?? 0,
    };
  };

  // Get border color based on poolMode and card data source
  const getCardBorderColor = (cardTitle: string): string => {
    const luxorOnlyCards = ["Uptime (24 hours)"];
    const dbOnlyCards = [
      "Monthly Revenue (30 days)",
      "Total Customer Balance",
      "Total Customers",
      "Positive Customer Balance",
      "Negative Customer Balance",
      "Positive Balance Customers",
      "Negative Balance Customers",
    ];

    if (poolMode === "luxor") return "#1565C0";
    if (poolMode === "braiins") return "#FFA500";

    if (luxorOnlyCards.includes(cardTitle)) return "#1565C0";
    if (dbOnlyCards.includes(cardTitle)) return "#757575";

    return "#9C27B0";
  };

  const poolStats = getPoolStats(poolMode);
  const minersStats = getMinersStats(poolMode);

  if (loading || customerBalanceLoading) {
    return (
      <Box
        sx={{
          p: 4,
          backgroundColor:
            theme.palette.mode === "dark"
              ? theme.palette.background.default
              : "#f5f5f7",
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
    <Box
      sx={{
        p: 4,
        backgroundColor:
          theme.palette.mode === "dark"
            ? theme.palette.background.default
            : "#f5f5f7",
        minHeight: "calc(100vh - 64px)",
      }}
    >
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error?.message || "An error occurred"}
        </Alert>
      )}

      {/* Pool Mode Toggle Buttons + Color Legend */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
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
              poolMode === "total" ? "#FFFFFF" : theme.palette.text.primary,
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
              poolMode === "luxor" ? "#FFFFFF" : theme.palette.text.primary,
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
                ? "rgba(0,0,0,0.87)"
                : theme.palette.text.primary,
            transition: "all 0.2s",
          }}
        >
          🟧 Braiins
        </button>

        {/* Divider */}
        <Box
          sx={{
            width: "1px",
            height: 28,
            backgroundColor: theme.palette.divider,
            mx: 1,
          }}
        />

        {/* Color Legend */}
        {[
          { color: "#757575", label: "DB value" },
          { color: "#9C27B0", label: "Luxor + Braiins combined" },
          { color: "#1565C0", label: "Luxor only" },
          { color: "#FFA500", label: "Braiins only" },
        ].map(({ color, label }) => (
          <Box
            key={color}
            sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
          >
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: "2px",
                backgroundColor: color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "0.75rem",
                color: theme.palette.text.secondary,
              }}
            >
              {label}
            </span>
          </Box>
        ))}
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

        {/* Customers Card */}
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

        {/* Total Customers Count */}
        <AdminValueCard
          title="Total Customers"
          borderColor="#757575"
          value={stats?.customers.total ?? 0}
        />

        {/* Monthly Revenue - From Cost Payments */}
        <AdminValueCard
          title="Monthly Revenue (30 days)"
          borderColor="#757575"
          value={stats?.financial.monthlyRevenue ?? 0}
          type="currency"
        />

        {/* Total Customer Balance */}
        <AdminValueCard
          title="Total Customer Balance"
          borderColor="#757575"
          value={stats?.financial.totalCustomerBalance ?? 0}
          type="currency"
        />

        {/* Total Mined Revenue - Luxor + Braiins, scoped to this franchisee's customers */}
        <AdminValueCard
          title="Total Mined Revenue"
          borderColor={getCardBorderColor("Total Mined Revenue")}
          value={poolStats?.minedRevenue ?? 0}
          type="BTC"
        />

        {/* Uptime 24h - global, same as admin. Braiins doesn't report uptime */}
        <AdminValueCard
          title="Uptime (24 hours)"
          borderColor={getCardBorderColor("Uptime (24 hours)")}
          value={
            poolMode === "braiins"
              ? "N/A"
              : `${(poolStats?.uptime_24h ?? 0).toFixed(2)}%`
          }
        />

        {/* Hashrate 5 min - global, same as admin */}
        <AdminValueCard
          title="Hashrate (5 min)"
          borderColor={getCardBorderColor("Hashrate (5 min)")}
          value={poolStats?.hashrate_5m ?? 0}
          subtitle="PH/s"
        />

        {/* Hashrate 24h - global, same as admin */}
        <AdminValueCard
          title="Hashrate (24 hours)"
          borderColor={getCardBorderColor("Hashrate (24 hours)")}
          value={poolStats?.hashrate_24h ?? 0}
          subtitle="PH/s"
        />

        {/* Positive Balance */}
        <AdminValueCard
          title="Positive Customer Balance"
          borderColor="#757575"
          value={customerBalanceData?.totalPositiveBalance ?? 0}
          type="currency"
        />

        {/* Negative Balance */}
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
          onClick={() => router.push("/franchise/customers?balanceFilter=> 0")}
        />

        {/* Negative Balance Customers Count */}
        <AdminValueCard
          title="Negative Balance Customers"
          borderColor="#757575"
          value={customerBalanceData?.negativeCustomerCount ?? 0}
          onClick={() => router.push("/franchise/customers?balanceFilter=< 0")}
        />
      </Box>

      {stats?.warnings && stats.warnings.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Alert severity="warning">{stats.warnings.join(", ")}</Alert>
        </Box>
      )}
    </Box>
  );
}
