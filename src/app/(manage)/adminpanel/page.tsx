"use client";

import React, { useState, useEffect } from "react";
import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminValueCard from "@/components/admin/AdminValueCard";
import { Box, CircularProgress, Alert } from "@mui/material";

interface DashboardStats {
  miners: {
    active: number;
    inactive: number;
  };
  spaces: {
    free: number;
    used: number;
  };
  customers: {
    active: number;
    inactive: number;
  };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/admin/dashboard");

      if (!response.ok) {
        throw new Error("Failed to fetch dashboard statistics");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch stats");
      }

      setStats(data.data);
    } catch (err) {
      console.error("Error fetching dashboard stats:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

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
            {error}
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

          {/* Customers Card */}
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

          {/* Power Card */}
          <AdminStatCard
            title="Power"
            stats={[
              { label: "Free kW", value: 7, color: "#00C853" },
              { label: "Used kW", value: 3, color: "#00B0FF" },
            ]}
          />

          {/* Monthly Revenue */}
          <AdminValueCard
            title="Monthly Revenue"
            value={45289}
            type="currency"
            // subtitle="$subtitle"
          />

          {/* Total Hash Rate */}
          <AdminValueCard
            title="Actual Hash Rate"
            value={892.5}
            subtitle="TH/s"
          />

          {/* Average Uptime */}
          <AdminValueCard title="Average Uptime" value={99.8} subtitle="%" />

          {/* 24H Share Efficiency */}
          <AdminValueCard title="24H Share Efficiency" value={0} subtitle="%" />

          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Total Mined Revenue"
            value={111111}
            subtitle="₿"
          />
          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Total Pool Accounts"
            value={3}
            // subtitle="₿"
          />
          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Active Pool Accounts"
            value={3}
            // subtitle="₿"
          />
          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Inactive Pool Accounts"
            value={0}
            // subtitle="₿"
          />
          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Total Customer Balance"
            value={1403.5}
            type="currency"
          />
          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Total Blocked Deposit"
            value={250000}
            type="currency"
          />
          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Positive Customer Balance"
            value={1525.02}
            type="currency"
          />
          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Negative Customer Balance"
            value={121.52}
            type="currency"
          />
          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Negative Balance Customers"
            value={1}
            // subtitle="₿"
          />
          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Customers"
            value={3}
            // subtitle="₿"
          />
          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Open Orders"
            value={0}
            // subtitle="₿"
          />
          {/* Total Mined Revenue */}
          <AdminValueCard title="Hosting Revenue" value={0.0} type="currency" />
          {/* Total Mined Revenue */}
          <AdminValueCard title="Hosting Profit" value={0.0} type="currency" />
          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Est Monthly Hosting Revenue"
            value={0.0}
            subtitle="$"
          />
          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Est Monthly Hosting Profit"
            value={0.0}
            type="currency"
          />
          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Est Yearly Hosting Revenue"
            value={0.0}
            type="currency"
          />
          {/* Total Mined Revenue */}
          <AdminValueCard
            title="Est Yearly Hosting Profit"
            value={0.0}
            type="currency"
          />
        </Box>
      </Box>
    </>
  );
}
