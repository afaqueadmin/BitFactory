import React from "react";
import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminValueCard from "@/components/admin/AdminValueCard";
import { Box } from "@mui/material";

export default function AdminDashboard() {
  return (
    <>
      <Box
        sx={{
          p: 4,
          backgroundColor: "#f5f5f7",
          minHeight: "calc(100vh - 64px)",
        }}
      >
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
              { label: "Active", value: 5, color: "#2196F3" },
              { label: "Inactive", value: 5, color: "#B0BEC5" },
            ]}
          />

          {/* Spaces Card */}
          <AdminStatCard
            title="Spaces"
            stats={[
              { label: "Free", value: 2, color: "#9C27B0" },
              { label: "Used", value: 8, color: "#673AB7" },
            ]}
          />

          {/* Customers Card */}
          <AdminStatCard
            title="Customers"
            stats={[
              { label: "Active", value: 3, color: "#EC407A" },
              { label: "Inactive", value: 0, color: "#B0BEC5" },
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
