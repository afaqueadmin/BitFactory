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
import FranchiseMinerFormModal from "./FranchiseMinerFormModal";
import MinersTable from "@/components/admin/MinersTable";
import { BulkEditModal } from "@/components/admin/BulkEditModal";
import { BulkDeleteModal } from "@/components/admin/BulkDeleteModal";

interface Customer {
  id: string;
  name: string;
  email: string;
}

interface MinerUser {
  id: string;
  name: string | null;
  email: string;
  luxorSubaccountName?: string | null;
  segment?: string | null;
}

interface Space {
  id: string;
  name: string;
  location: string;
}

interface Hardware {
  id: string;
  model: string;
  powerUsage: number;
  quantity: number;
  hashRate: number | string;
}

interface Pool {
  id: string;
  name: string;
  apiUrl: string;
  description?: string | null;
}

interface Miner {
  id: string;
  name: string;
  status: "AUTO" | "DEPLOYMENT_IN_PROGRESS" | "UNDER_MAINTENANCE";
  hardwareId: string;
  userId: string;
  spaceId: string;
  poolId?: string | null;
  createdAt: string;
  updatedAt: string;
  rate_per_kwh?: number;
  serialNumber?: string | null;
  macAddress?: string | null;
  isDeleted: boolean;
  user?: MinerUser;
  space?: Space;
  hardware?: Hardware;
  pool?: Pool;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export default function FranchiseMinersContent() {
  const [miners, setMiners] = useState<Miner[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedMiner, setSelectedMiner] = useState<Miner | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [selectedUserFilter, setSelectedUserFilter] = useState("");
  const [selectedSpaceFilter, setSelectedSpaceFilter] = useState("");
  const [selectedModelFilter, setSelectedModelFilter] = useState("");
  const [selectedRateFilter, setSelectedRateFilter] = useState("");
  const [selectedPoolFilter, setSelectedPoolFilter] = useState("");
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const minerUrl = new URL("/api/franchise/miners", window.location.origin);
      if (showDeleted) minerUrl.searchParams.set("isDeleted", "true");

      const [minersRes, spacesRes, customersRes, poolsRes] = await Promise.all([
        fetch(minerUrl),
        fetch("/api/franchise/spaces"),
        fetch("/api/franchise/customers"),
        fetch("/api/pools"),
      ]);

      if (!minersRes.ok) throw new Error("Failed to fetch miners");
      const minersData: ApiResponse<Miner[]> = await minersRes.json();
      if (!minersData.success)
        throw new Error(minersData.error || "Failed to fetch miners");
      setMiners(minersData.data || []);

      if (spacesRes.ok) {
        const spacesData: ApiResponse<Space[]> = await spacesRes.json();
        if (spacesData.success && spacesData.data) setSpaces(spacesData.data);
      }

      if (customersRes.ok) {
        const customersData = await customersRes.json();
        if (customersData.success && customersData.users) {
          setCustomers(
            (
              customersData.users as Array<{
                id: string;
                name: string;
                email: string;
              }>
            )
              .map((u) => ({ id: u.id, name: u.name, email: u.email }))
              .sort((a, b) =>
                a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
              ),
          );
        }
      }

      if (poolsRes.ok) {
        const poolsData: ApiResponse<Pool[]> = await poolsRes.json();
        if (poolsData.success && poolsData.data) setPools(poolsData.data);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while loading data",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDeleted]);

  const handleCreate = () => {
    setSelectedMiner(null);
    setFormOpen(true);
  };

  const handleEdit = (miner: Miner) => {
    setSelectedMiner(miner);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setSelectedMiner(null);
  };

  const handleFormSuccess = () => {
    handleFormClose();
    fetchData();
  };

  const handleDelete = async (minerId: string) => {
    try {
      setTableError(null);
      const response = await fetch(`/api/franchise/miners/${minerId}`, {
        method: "DELETE",
      });
      const data: ApiResponse = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete miner");
      await fetchData();
    } catch (err) {
      setTableError(
        err instanceof Error
          ? err.message
          : "An error occurred while deleting the miner",
      );
    }
  };

  const handleBulkEdit = async (updates: Record<string, unknown>) => {
    setTableError(null);
    const filteredMinerIds = getSortedFilteredMiners().map((m) => m.id);
    try {
      const response = await fetch("/api/franchise/miners/bulk-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minerIds: filteredMinerIds, updates }),
      });
      const data: ApiResponse = await response.json();
      if (!response.ok) {
        const errorMsg = data.error || "Failed to update miners";
        setTableError(errorMsg);
        throw new Error(errorMsg);
      }
      await fetchData();
    } catch (err) {
      setTableError(
        err instanceof Error
          ? err.message
          : "An error occurred while updating miners",
      );
      throw err;
    }
  };

  const handleBulkDelete = async () => {
    setTableError(null);
    const filteredMinerIds = getSortedFilteredMiners().map((m) => m.id);
    try {
      const response = await fetch("/api/franchise/miners/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minerIds: filteredMinerIds }),
      });
      const data: ApiResponse = await response.json();
      if (!response.ok) {
        const errorMsg = data.error || "Failed to delete miners";
        setTableError(errorMsg);
        throw new Error(errorMsg);
      }
      await fetchData();
    } catch (err) {
      setTableError(
        err instanceof Error
          ? err.message
          : "An error occurred while deleting miners",
      );
      throw err;
    }
  };

  const getUniqueModels = () => {
    const models = new Set<string>();
    miners.forEach((m) => {
      if (m.hardware?.model) models.add(m.hardware.model);
    });
    return Array.from(models).sort();
  };

  const getUniqueRates = () => {
    const rates = new Set<number>();
    miners.forEach((m) => {
      if (m.rate_per_kwh) rates.add(Number(m.rate_per_kwh));
    });
    return Array.from(rates)
      .sort((a, b) => a - b)
      .map((rate) => rate.toString());
  };

  const getUniquePools = () => {
    const hasUnassigned = miners.some((m) => !m.poolId);
    const poolOptions: Array<{ id: string; name: string }> = [];
    if (hasUnassigned)
      poolOptions.push({ id: "UNASSIGNED", name: "Unassigned" });
    poolOptions.push(
      ...pools.map((pool) => ({ id: pool.id, name: pool.name })),
    );
    return poolOptions;
  };

  const getSortedFilteredMiners = () => {
    let filtered = miners;

    if (selectedUserFilter) {
      filtered = filtered.filter((m) => m.userId === selectedUserFilter);
    }
    if (selectedSpaceFilter) {
      filtered = filtered.filter((m) => m.spaceId === selectedSpaceFilter);
    }
    if (selectedModelFilter) {
      filtered = filtered.filter(
        (m) => m.hardware?.model === selectedModelFilter,
      );
    }
    if (selectedRateFilter) {
      const targetRate = parseFloat(selectedRateFilter);
      filtered = filtered.filter(
        (m) =>
          m.rate_per_kwh &&
          Math.abs(Number(m.rate_per_kwh) - targetRate) < 0.0001,
      );
    }
    if (selectedPoolFilter) {
      filtered =
        selectedPoolFilter === "UNASSIGNED"
          ? filtered.filter((m) => !m.poolId)
          : filtered.filter((m) => m.poolId === selectedPoolFilter);
    }

    return filtered.sort((a, b) => {
      if (a.userId !== b.userId) {
        const nameA = customers.find((c) => c.id === a.userId)?.name || "";
        const nameB = customers.find((c) => c.id === b.userId)?.name || "";
        return nameA.localeCompare(nameB);
      }
      return a.name.localeCompare(b.name);
    });
  };

  return (
    <Box
      component="main"
      sx={{ py: 4, backgroundColor: "background.default", minHeight: "100vh" }}
    >
      <Container maxWidth="xl">
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          sx={{ mb: 4 }}
        >
          <Box>
            <Typography variant="h3" component="h1" sx={{ fontWeight: "bold" }}>
              All Miners
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Manage and monitor your customers&apos; mining machines
            </Typography>
          </Box>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
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

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

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
                  <InputLabel>Filter by Customer</InputLabel>
                  <Select
                    value={selectedUserFilter}
                    onChange={(e: SelectChangeEvent) =>
                      setSelectedUserFilter(e.target.value)
                    }
                    label="Filter by Customer"
                  >
                    <MenuItem value="">
                      <em>All Customers</em>
                    </MenuItem>
                    {customers.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name} ({c.email})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl sx={{ minWidth: 250 }}>
                  <InputLabel>Filter by Space</InputLabel>
                  <Select
                    value={selectedSpaceFilter}
                    onChange={(e: SelectChangeEvent) =>
                      setSelectedSpaceFilter(e.target.value)
                    }
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
                    onChange={(e: SelectChangeEvent) =>
                      setSelectedModelFilter(e.target.value)
                    }
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
                    onChange={(e: SelectChangeEvent) =>
                      setSelectedRateFilter(e.target.value)
                    }
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

                <FormControl sx={{ minWidth: 250 }}>
                  <InputLabel>Filter by Pool</InputLabel>
                  <Select
                    value={selectedPoolFilter}
                    onChange={(e: SelectChangeEvent) =>
                      setSelectedPoolFilter(e.target.value)
                    }
                    label="Filter by Pool"
                  >
                    <MenuItem value="">
                      <em>All Pools</em>
                    </MenuItem>
                    {getUniquePools().map((pool) => (
                      <MenuItem key={pool.id} value={pool.id}>
                        {pool.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </Box>

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

        <FranchiseMinerFormModal
          open={formOpen}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
          miner={selectedMiner}
          customers={customers}
          spaces={spaces}
          pools={pools}
        />

        <BulkEditModal
          isOpen={showBulkEditModal}
          onClose={() => setShowBulkEditModal(false)}
          minerCount={getSortedFilteredMiners().length}
          spaces={spaces}
          pools={pools}
          onSubmit={handleBulkEdit}
        />

        <BulkDeleteModal
          isOpen={showBulkDeleteModal}
          onClose={() => setShowBulkDeleteModal(false)}
          minerCount={getSortedFilteredMiners().length}
          minersPreview={getSortedFilteredMiners()
            .slice(0, 10)
            .map((m) => ({
              id: m.id,
              name: m.name,
              hardwareName: m.hardware?.model,
              spaceName: m.space?.name,
            }))}
          onSubmit={handleBulkDelete}
        />
      </Container>
    </Box>
  );
}
