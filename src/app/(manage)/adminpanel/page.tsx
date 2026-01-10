"use client";
//src/app/(manage)/adminpanel/page.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminValueCard from "@/components/admin/AdminValueCard";
import { Box, CircularProgress, Alert } from "@mui/material";

interface DashboardStats {
  miners: {
    active: number;
    inactive: number;
    actionRequired: number;
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
  luxor: {
    poolAccounts: {
      total: number;
      active: number;
      inactive: number;
    };
    workers: {
      activeWorkers: number;
      inactiveWorkers: number;
      totalWorkers: number;
    };
    hashrate_5m: number;
    hashrate_24h: number;
    uptime_24h: number;
    power: {
      totalPower: number;
      availablePower: number;
    };
  };
  financial: {
    totalCustomerBalance: number;
    monthlyRevenue: number;
    totalMinedRevenue: number;
  };
  warnings: string[];
}

export default function AdminDashboard() {
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

  if (loading) {
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
            stats={[
              {
                label: "Active",
                value: stats?.miners.active ?? 0,
                color: "#2196F3",
              },
              {
                label: "Inactive",
                value: stats?.miners.inactive ?? 0,
                color: "#B0BEC5",
              },
              {
                label: "Review",
                value: stats?.miners.actionRequired ?? 0,
                color: "#FF5722",
              },
            ]}
          />

          {/* Spaces Card */}
          <AdminStatCard
            title="Spaces"
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

          {/* Power Card - Calculated from miners */}
          <AdminStatCard
            title="Power"
            stats={[
              {
                label: "Free kW",
                value:
                  (stats?.luxor.power.availablePower ?? 0) -
                  (stats?.luxor.power.totalPower ?? 0),
                color: "#00C853",
              },
              {
                label: "Used kW",
                value: stats?.luxor.power.totalPower ?? 0,
                color: "#00B0FF",
              },
            ]}
          />

          {/* === LUXOR POOL STATS === */}

          {/* Monthly Revenue - From Cost Payments */}
          <AdminValueCard
            title="Monthly Revenue (30 days)"
            value={stats?.financial.monthlyRevenue ?? 0}
            type="currency"
          />

          {/* Total Customer Balance, from our database */}
          <AdminValueCard
            title="Total Customer Balance"
            value={stats?.financial.totalCustomerBalance ?? 0}
            type="currency"
          />

          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Total Mined Revenue"
            value={stats?.financial.totalMinedRevenue ?? 0}
            subtitle="₿"
            type="BTC"
          />

          {/* Uptime 24h - From Luxor */}
          <AdminValueCard
            title="Uptime (24 hours)"
            value={`${(stats?.luxor.uptime_24h ?? 0).toFixed(4)}%`}
          />

          {/* Hashrate 5 min - Current from Luxor */}
          <AdminValueCard
            title="Hashrate (5 min)"
            value={stats?.luxor.hashrate_5m ?? 0}
            subtitle="PH/s"
          />

          {/* Hashrate 24h - 24 hour average */}
          <AdminValueCard
            title="Hashrate (24 hours)"
            value={stats?.luxor.hashrate_24h ?? 0}
            subtitle="PH/s"
          />

          {/* === LUXOR POOL ACCOUNTS === */}

          {/* Total Pool Accounts */}
          <AdminValueCard
            title="Total Pool Accounts"
            value={stats?.luxor.poolAccounts.total ?? 0}
          />

          {/* Active Pool Accounts */}
          <AdminValueCard
            title="Active Pool Accounts"
            value={stats?.luxor.poolAccounts.active ?? 0}
          />

          {/* Inactive Pool Accounts */}
          <AdminValueCard
            title="Inactive Pool Accounts"
            value={stats?.luxor.poolAccounts.inactive ?? 0}
          />

          {/* === WORKER STATISTICS FROM LUXOR === */}

          {/* Total Workers */}
          <AdminValueCard
            title="Total Workers"
            value={stats?.luxor.workers.totalWorkers ?? 0}
          />

          {/* Active Workers */}
          <AdminValueCard
            title="Active Workers"
            value={stats?.luxor.workers.activeWorkers ?? 0}
          />

          {/* Inactive Workers */}
          <AdminValueCard
            title="Inactive Workers"
            value={stats?.luxor.workers.inactiveWorkers ?? 0}
          />

          {/* === CUSTOMER FINANCIAL METRICS === */}

          {/* Total Customers Count */}
          <AdminValueCard
            title="Total Customers"
            value={stats?.customers.total ?? 0}
          />

          {/* === RESERVED FOR FUTURE LUXOR ENDPOINTS === */}

          {/* Open Orders - Not yet implemented */}
          <AdminValueCard title="Open Orders" value="N/A" />

          {/* Hosting Revenue - Not yet implemented */}
          <AdminValueCard title="Hosting Revenue" value="N/A" />

          {/* Hosting Profit - Not yet implemented */}
          <AdminValueCard title="Hosting Profit" value="N/A" />

          {/* Est Monthly Hosting Revenue - Not yet implemented */}
          <AdminValueCard title="Est Monthly Hosting Revenue" value="N/A" />

          {/* Est Monthly Hosting Profit - Not yet implemented */}
          <AdminValueCard title="Est Monthly Hosting Profit" value="N/A" />

          {/* Est Yearly Hosting Revenue - Not yet implemented */}
          <AdminValueCard title="Est Yearly Hosting Revenue" value="N/A" />

          {/* Est Yearly Hosting Profit - Not yet implemented */}
          <AdminValueCard title="Est Yearly Hosting Profit" value="N/A" />

          {/* Blocked Deposit - Not yet implemented */}
          <AdminValueCard title="Total Blocked Deposit" value="N/A" />

          {/* Positive Balance - Aggregated from customer payments */}
          <AdminValueCard title="Positive Customer Balance" value="N/A" />

          {/* Negative Balance - Aggregated from customer payments */}
          <AdminValueCard title="Negative Customer Balance" value="N/A" />

          {/* Negative Balance Customers Count */}
          <AdminValueCard title="Negative Balance Customers" value="N/A" />
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
