"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Container,
  Typography,
  Button,
  Stack,
  Alert,
  CircularProgress,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import MinerFormModal from "@/components/admin/MinerFormModal";
import MinersTable from "@/components/admin/MinersTable";

/**
 * User object from API
 */
interface User {
  id: string;
  name: string | null;
  email: string;
  role?: string;
}

/**
 * Space object from API
 */
interface Space {
  id: string;
  name: string;
  location: string;
}

/**
 * Miner object from API
 */
interface Miner {
  id: string;
  name: string;
  model: string;
  status: "ACTIVE" | "INACTIVE";
  powerUsage: number;
  hashRate: number;
  userId: string;
  spaceId: string;
  createdAt: string;
  updatedAt: string;
  user?: User;
  space?: Space;
}

/**
 * API Response type
 */
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export default function MachinePage() {
  const [miners, setMiners] = useState<Miner[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedMiner, setSelectedMiner] = useState<Miner | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);

  /**
   * Fetch all miners, users, and spaces
   */
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [minersRes, spacesRes, usersRes] = await Promise.all([
        fetch("/api/machine"),
        fetch("/api/spaces"),
        fetch("/api/user/all"),
      ]);

      if (!minersRes.ok) {
        throw new Error("Failed to fetch miners");
      }

      const minersData: ApiResponse<Miner[]> = await minersRes.json();

      if (!minersData.success) {
        throw new Error(minersData.error || "Failed to fetch miners");
      }

      setMiners(minersData.data || []);

      // Fetch spaces
      if (spacesRes.ok) {
        const spacesData: ApiResponse<Space[]> = await spacesRes.json();
        if (spacesData.success && spacesData.data) {
          setSpaces(spacesData.data);
        }
      }

      // Fetch users
      if (usersRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const usersData: any = await usersRes.json();
        if (usersData.success && usersData.users) {
          // Transform users data to match our User interface
          const transformedUsers: User[] = usersData.users
            .filter((user: User) => user.role === "CLIENT")
            .map((user: User) => ({
              id: user.id,
              name: user.name,
              email: user.email,
            }))
            .sort((a: User, b: User) => {
              const aLowerCase = a.name!.toLowerCase();
              const bLowerCase = b.name!.toLowerCase();
              if (aLowerCase < bLowerCase) {
                return -1;
              }
              if (aLowerCase > bLowerCase) {
                return 1;
              }
              return 0;
            });
          setUsers(transformedUsers);
        }
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "An error occurred while loading data";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load data on component mount
   */
  useEffect(() => {
    fetchData();
  }, []);

  /**
   * Handle create new miner
   */
  const handleCreate = () => {
    setSelectedMiner(null);
    setFormOpen(true);
  };

  /**
   * Handle edit miner
   */
  const handleEdit = (miner: Miner) => {
    setSelectedMiner(miner);
    setFormOpen(true);
  };

  /**
   * Handle form close
   */
  const handleFormClose = () => {
    setFormOpen(false);
    setSelectedMiner(null);
  };

  /**
   * Handle successful form submission
   */
  const handleFormSuccess = () => {
    handleFormClose();
    fetchData();
  };

  /**
   * Handle delete miner
   */
  const handleDelete = async (minerId: string) => {
    try {
      setTableError(null);

      const response = await fetch(`/api/machine/${minerId}`, {
        method: "DELETE",
      });

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete miner");
      }

      // Refresh miners list
      await fetchData();
    } catch (err) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "An error occurred while deleting the miner";
      setTableError(errorMsg);
    }
  };

  return (
    <Box
      component="main"
      sx={{ py: 4, backgroundColor: "background.default", minHeight: "100vh" }}
    >
      <Container maxWidth="xl">
        {/* Header Section */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          sx={{ mb: 4 }}
        >
          <Box>
            <Typography variant="h3" component="h1" sx={{ fontWeight: "bold" }}>
              Miners Management
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Manage and monitor all mining machines in your system
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreate}
            disabled={loading || formOpen}
            size="large"
          >
            Add Miner
          </Button>
        </Stack>

        {/* Error Message */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
            <Button
              size="small"
              sx={{ ml: 2 }}
              onClick={fetchData}
              disabled={loading}
            >
              Retry
            </Button>
          </Alert>
        )}

        {/* Loading State */}
        {loading ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "400px",
            }}
          >
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Stats Bar */}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              sx={{ mb: 3 }}
            >
              <Box
                sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1, flex: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  Total Miners
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: "bold", mt: 0.5 }}>
                  {miners.length}
                </Typography>
              </Box>
              <Box
                sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1, flex: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  Active Miners
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: "bold", mt: 0.5 }}>
                  {miners.filter((m) => m.status === "ACTIVE").length}
                </Typography>
              </Box>
              <Box
                sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1, flex: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  Total Hash Rate
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: "bold", mt: 0.5 }}>
                  {miners.reduce((sum, m) => sum + m.hashRate, 0).toFixed(2)}{" "}
                  TH/s
                </Typography>
              </Box>
              <Box
                sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1, flex: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  Total Power Usage
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: "bold", mt: 0.5 }}>
                  {miners.reduce((sum, m) => sum + m.powerUsage, 0).toFixed(2)}{" "}
                  kWh
                </Typography>
              </Box>
            </Stack>

            {/* Miners Table */}
            <MinersTable
              miners={miners}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={loading}
              error={tableError}
            />
          </>
        )}
      </Container>

      {/* Miner Form Modal */}
      <MinerFormModal
        open={formOpen}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
        miner={selectedMiner}
        users={users}
        spaces={spaces}
        isLoading={loading}
      />
    </Box>
  );
}
