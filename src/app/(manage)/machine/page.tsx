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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import MinerFormModal from "@/components/admin/MinerFormModal";
import MinersTable from "@/components/admin/MinersTable";
import { BulkEditModal } from "@/components/admin/BulkEditModal";
import { BulkDeleteModal } from "@/components/admin/BulkDeleteModal";

/**
 * User object from API
 */
interface User {
  id: string;
  name: string | null;
  email: string;
  role?: string;
  luxorSubaccountName?: string | null;
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
 * Hardware object from API
 */
interface Hardware {
  id: string;
  model: string;
  powerUsage: number;
  quantity: number;
  hashRate: number | string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Miner object from API
 */
interface Miner {
  id: string;
  name: string;
  status: "AUTO" | "DEPLOYMENT_IN_PROGRESS";
  hardwareId: string;
  userId: string;
  spaceId: string;
  createdAt: string;
  updatedAt: string;
  rate_per_kwh?: number;
  isDeleted: boolean;
  user?: User;
  space?: Space;
  hardware?: Hardware;
  ownershipHistory?: Array<{
    id: string;
    minerId?: string;
    owner: {
      id: string;
      name: string | null;
      email: string;
    };
    createdBy: {
      id: string;
      name: string | null;
      email: string;
    };
    createdAt: string;
  }>;
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
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>("");
  const [selectedSpaceFilter, setSelectedSpaceFilter] = useState<string>("");
  const [selectedModelFilter, setSelectedModelFilter] = useState<string>("");
  const [selectedRateFilter, setSelectedRateFilter] = useState<string>("");
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  /**
   * Fetch all miners, users, and spaces
   */
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const minerUrl = new URL("/api/machine", window.location.origin);
      if (showDeleted) {
        minerUrl.searchParams.append("isDeleted", "true");
      }
      const [minersRes, spacesRes, usersRes] = await Promise.all([
        fetch(minerUrl),
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
  }, [showDeleted]);

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

  /**
   * Handle bulk edit
   */
  const handleBulkEdit = async (updates: Record<string, unknown>) => {
    setTableError(null);
    const filteredMinerIds = getSortedFilteredMiners().map((m) => m.id);

    try {
      const response = await fetch("/api/machine/bulk-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minerIds: filteredMinerIds,
          updates,
        }),
      });

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || "Failed to update miners";
        setTableError(errorMsg);
        throw new Error(errorMsg);
      }

      // Refresh miners list and wait for completion
      await fetchData();
      // Successfully updated and refreshed - operation complete
    } catch (err) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "An error occurred while updating miners";
      setTableError(errorMsg);
      throw err;
    }
  };

  /**
   * Handle bulk delete
   */
  const handleBulkDelete = async () => {
    setTableError(null);
    const filteredMinerIds = getSortedFilteredMiners().map((m) => m.id);

    try {
      const response = await fetch("/api/machine/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minerIds: filteredMinerIds,
        }),
      });

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || "Failed to delete miners";
        setTableError(errorMsg);
        throw new Error(errorMsg);
      }

      // Refresh miners list and wait for completion
      await fetchData();
      // Successfully deleted and refreshed - operation complete
    } catch (err) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "An error occurred while deleting miners";
      setTableError(errorMsg);
      throw err;
    }
  };

  /**
   * Handle user filter change
   */
  const handleUserFilterChange = (event: SelectChangeEvent) => {
    setSelectedUserFilter(event.target.value);
  };

  /**
   * Handle space filter change
   */
  const handleSpaceFilterChange = (event: SelectChangeEvent) => {
    setSelectedSpaceFilter(event.target.value);
  };

  /**
   * Handle model filter change
   */
  const handleModelFilterChange = (event: SelectChangeEvent) => {
    setSelectedModelFilter(event.target.value);
  };

  /**
   * Handle rate filter change
   */
  const handleRateFilterChange = (event: SelectChangeEvent) => {
    setSelectedRateFilter(event.target.value);
  };

  /**
   * Get unique models from miners
   */
  const getUniqueModels = () => {
    const models = new Set<string>();
    miners.forEach((m) => {
      if (m.hardware?.model) {
        models.add(m.hardware.model);
      }
    });
    return Array.from(models).sort();
  };

  /**
   * Get unique rates from miners
   */
  const getUniqueRates = () => {
    const rates = new Set<number>();
    miners.forEach((m) => {
      if (m.rate_per_kwh) {
        rates.add(Number(m.rate_per_kwh));
      }
    });
    return Array.from(rates)
      .sort((a, b) => a - b)
      .map((rate) => rate.toString());
  };

  /**
   * Get sorted and filtered miners
   */
  const getSortedFilteredMiners = () => {
    let filtered = miners;

    // Filter by selected user
    if (selectedUserFilter) {
      filtered = filtered.filter((m) => m.userId === selectedUserFilter);
    }

    // Filter by selected space
    if (selectedSpaceFilter) {
      filtered = filtered.filter((m) => m.spaceId === selectedSpaceFilter);
    }

    // Filter by selected model
    if (selectedModelFilter) {
      filtered = filtered.filter(
        (m) => m.hardware?.model === selectedModelFilter,
      );
    }

    // Filter by selected rate
    if (selectedRateFilter) {
      const targetRate = parseFloat(selectedRateFilter);
      filtered = filtered.filter(
        (m) =>
          m.rate_per_kwh &&
          Math.abs(Number(m.rate_per_kwh) - targetRate) < 0.0001,
      );
    }

    // Sort by user (grouped by userId, then by miner name within each user)
    return filtered.sort((a, b) => {
      // First sort by user ID
      if (a.userId !== b.userId) {
        const userA = users.find((u) => u.id === a.userId);
        const userB = users.find((u) => u.id === b.userId);
        const nameA = userA?.name || "";
        const nameB = userB?.name || "";
        return nameA.localeCompare(nameB);
      }
      // Then sort by miner name within same user
      return a.name.localeCompare(b.name);
    });
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
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              color="warning"
              onClick={() => setShowBulkEditModal(true)}
              disabled={
                loading || formOpen || getSortedFilteredMiners().length === 0
              }
            >
              Bulk Edit
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => setShowBulkDeleteModal(true)}
              disabled={
                loading || formOpen || getSortedFilteredMiners().length === 0
              }
            >
              Bulk Delete
            </Button>
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
            {/* Filter Section */}
            <Box
              sx={{
                p: 2,
                mb: 3,
                bgcolor: "background.paper",
                borderRadius: 1,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="body2"
                sx={{ fontWeight: "600", mb: 2, color: "text.secondary" }}
              >
                Filter Options
              </Typography>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{ flexWrap: "wrap" }}
              >
                <FormControl sx={{ minWidth: 250 }}>
                  <InputLabel>Filter by User</InputLabel>
                  <Select
                    value={selectedUserFilter}
                    onChange={handleUserFilterChange}
                    label="Filter by User"
                  >
                    <MenuItem value="">
                      <em>All Users</em>
                    </MenuItem>
                    {users.map((user) => (
                      <MenuItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl sx={{ minWidth: 250 }}>
                  <InputLabel>Filter by Space</InputLabel>
                  <Select
                    value={selectedSpaceFilter}
                    onChange={handleSpaceFilterChange}
                    label="Filter by Space"
                  >
                    <MenuItem value="">
                      <em>All Spaces</em>
                    </MenuItem>
                    {spaces.map((space) => (
                      <MenuItem key={space.id} value={space.id}>
                        {space.name} ({space.location})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl sx={{ minWidth: 250 }}>
                  <InputLabel>Filter by Model</InputLabel>
                  <Select
                    value={selectedModelFilter}
                    onChange={handleModelFilterChange}
                    label="Filter by Model"
                  >
                    <MenuItem value="">
                      <em>All Models</em>
                    </MenuItem>
                    {getUniqueModels().map((model) => (
                      <MenuItem key={model} value={model}>
                        {model}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl sx={{ minWidth: 250 }}>
                  <InputLabel>Filter by Rate</InputLabel>
                  <Select
                    value={selectedRateFilter}
                    onChange={handleRateFilterChange}
                    label="Filter by Rate"
                  >
                    <MenuItem value="">
                      <em>All Rates</em>
                    </MenuItem>
                    {getUniqueRates().map((rate) => (
                      <MenuItem key={rate} value={rate}>
                        ${parseFloat(rate).toFixed(3)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </Box>

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
                  {getSortedFilteredMiners().length}
                </Typography>
              </Box>
              <Box
                sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1, flex: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  Active Miners
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: "bold", mt: 0.5 }}>
                  {
                    getSortedFilteredMiners().filter((m) => m.status === "AUTO")
                      .length
                  }
                </Typography>
              </Box>
              <Box
                sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1, flex: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  Total Hash Rate
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: "bold", mt: 0.5 }}>
                  {getSortedFilteredMiners()
                    .reduce(
                      (sum, m) =>
                        sum + parseFloat(String(m.hardware?.hashRate || 0)),
                      0,
                    )
                    .toFixed(2)}{" "}
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
                  {getSortedFilteredMiners()
                    .reduce((sum, m) => sum + (m.hardware?.powerUsage || 0), 0)
                    .toFixed(2)}{" "}
                  kW
                </Typography>
              </Box>
            </Stack>

            {/* Miners Table */}
            <MinersTable
              miners={getSortedFilteredMiners()}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={loading}
              error={tableError}
              showDeleted={showDeleted}
              setShowDeleted={setShowDeleted}
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

      {/* Bulk Edit Modal */}
      <BulkEditModal
        isOpen={showBulkEditModal}
        onClose={() => setShowBulkEditModal(false)}
        minerCount={getSortedFilteredMiners().length}
        spaces={spaces}
        onSubmit={handleBulkEdit}
      />

      {/* Bulk Delete Modal */}
      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        minerCount={getSortedFilteredMiners().length}
        minersPreview={getSortedFilteredMiners().slice(0, 10)}
        onSubmit={handleBulkDelete}
      />
    </Box>
  );
}
