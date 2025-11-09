"use client";

import React, { useState } from "react";
import {
  Box,
  Grid as MuiGrid,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import AdminValueCard from "@/components/admin/AdminValueCard";
import CreateUserModal from "@/components/CreateUserModal";

interface CustomerStats {
  totalCustomers: number;
  activeCustomers: number;
  totalRevenue: number;
  totalMiners: number;
}

interface CustomerTableData {
  id: string;
  name: string;
  email: string;
  miners: number;
  revenue: number;
  status: "active" | "inactive";
  joinDate: string;
}

const mockCustomerStats: CustomerStats = {
  totalCustomers: 150,
  activeCustomers: 125,
  totalRevenue: 750000,
  totalMiners: 450,
};

const mockTableData: CustomerTableData[] = [
  {
    id: "1",
    name: "John Doe",
    email: "john@example.com",
    miners: 5,
    revenue: 25000,
    status: "active",
    joinDate: "2025-01-15",
  },
  {
    id: "2",
    name: "Jane Smith",
    email: "jane@example.com",
    miners: 3,
    revenue: 15000,
    status: "active",
    joinDate: "2025-02-20",
  },
  {
    id: "3",
    name: "Bob Wilson",
    email: "bob@example.com",
    miners: 2,
    revenue: 10000,
    status: "inactive",
    joinDate: "2025-03-10",
  },
];

// Create a Grid component that includes the 'item' prop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Grid = MuiGrid as React.ComponentType<any>;

export default function CustomerOverview() {
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const handleUserCreated = () => {
    // Refresh the customer list/stats
    // You can add the refresh logic here
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Page Title with Create Button */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 4,
        }}
      >
        <Typography
          variant="h4"
          sx={{
            fontWeight: "bold",
            color: (theme) =>
              theme.palette.mode === "dark" ? "primary.light" : "primary.dark",
          }}
        >
          Customer Overview
        </Typography>

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateModalOpen(true)}
          sx={{
            px: 3,
            py: 1,
            background: (theme) =>
              `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
            boxShadow: (theme) => `0 4px 20px ${theme.palette.primary.main}40`,
            "&:hover": {
              background: (theme) =>
                `linear-gradient(45deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
              boxShadow: (theme) =>
                `0 6px 25px ${theme.palette.primary.main}60`,
            },
          }}
        >
          Create User
        </Button>
      </Box>

      {/* Create User Modal */}
      <CreateUserModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={handleUserCreated}
      />

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <AdminValueCard
            title="Total Customers"
            value={mockCustomerStats.totalCustomers}
            type="number"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <AdminValueCard
            title="Active Customers"
            value={mockCustomerStats.activeCustomers}
            type="number"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <AdminValueCard
            title="Total Revenue"
            value={mockCustomerStats.totalRevenue}
            type="currency"
            subtitle="USD"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <AdminValueCard
            title="Total Miners"
            value={mockCustomerStats.totalMiners}
            type="number"
          />
        </Grid>
      </Grid>

      {/* Customer Activity */}
      <Paper
        elevation={3}
        sx={{
          p: 3,
          mb: 4,
          borderRadius: 2,
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
              : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
          backdropFilter: "blur(10px)",
          border: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Typography variant="h6" sx={{ mb: 3, fontWeight: "medium" }}>
          Recent Customers
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Customer</TableCell>
                <TableCell>Email</TableCell>
                <TableCell align="center">Miners</TableCell>
                <TableCell align="right">Revenue</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell>Join Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mockTableData.map((customer) => (
                <TableRow
                  key={customer.id}
                  sx={{
                    "&:last-child td, &:last-child th": { border: 0 },
                    "&:hover": {
                      backgroundColor: "action.hover",
                    },
                  }}
                >
                  <TableCell component="th" scope="row">
                    {customer.name}
                  </TableCell>
                  <TableCell>{customer.email}</TableCell>
                  <TableCell align="center">{customer.miners}</TableCell>
                  <TableCell align="right">
                    ${customer.revenue.toLocaleString()}
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={customer.status}
                      color={
                        customer.status === "active" ? "success" : "default"
                      }
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(customer.joinDate).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Activity Chart Section */}
      <Paper
        elevation={3}
        sx={{
          p: 3,
          borderRadius: 2,
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
              : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
          backdropFilter: "blur(10px)",
          border: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Typography variant="h6" sx={{ mb: 3, fontWeight: "medium" }}>
          Customer Growth
        </Typography>
        {/* Placeholder for chart - you can add a chart library of your choice */}
        <Box
          sx={{
            height: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography color="text.secondary">
            Customer growth chart will be displayed here
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
