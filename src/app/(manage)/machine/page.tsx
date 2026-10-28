"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import { useRouter } from "next/navigation";
import MinerFormModal from "@/components/admin/MinerFormModal";
import MinersTable from "@/components/admin/MinersTable";
import { BulkEditModal } from "@/components/admin/BulkEditModal";
import { BulkDeleteModal } from "@/components/admin/BulkDeleteModal";
import { getWarrantyStatus, WARRANTY_EXPIRING_DAYS } from "@/lib/minerWarranty";
import AdminValueCard from "@/components/admin/AdminValueCard";
import {
  DaylightAdminPage,
  DaylightLoading,
  DaylightPageHeader,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

/**
 * User object from API
 */
interface User {
  id: string;
  name: string | null;
  email: string;
  role?: string;
  luxorSubaccounts?: string[];
  segment?: string | null;
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
 * Pool object from API
 */
interface Pool {
  id: string;
  name: string;
  apiUrl: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Miner object from API
 */
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
  benchmarkHashrate?: number;
  serialNumber?: string | null;
  macAddress?: string | null;
  warrantyExpiresAt?: string | null;
  isDeleted: boolean;
  user?: User;
  space?: Space;
  hardware?: Hardware;
  pool?: Pool;
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
  repairNotes?: Array<{
    id: string;
    note: string;
    dateOfEntry: string;
    createdAt: string;
    createdBy: {
      name: string | null;
      email: string;
    };
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
  const ds = useDaylightAdminSx();
  const router = useRouter();
  const [miners, setMiners] = useState<Miner[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedMiner, setSelectedMiner] = useState<Miner | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>("");
  const [selectedSpaceFilter, setSelectedSpaceFilter] = useState<string>("");
  const [selectedModelFilter, setSelectedModelFilter] = useState<string>("");
  const [selectedRateFilter, setSelectedRateFilter] = useState<string>("");
  const [selectedBenchmarkFilter, setSelectedBenchmarkFilter] =
    useState<string>("");
  const [selectedPoolFilter, setSelectedPoolFilter] = useState<string>("");
  const [selectedSegmentFilter, setSelectedSegmentFilter] =
    useState<string>("");
  const [selectedWarrantyFilter, setSelectedWarrantyFilter] =
    useState<string>("");
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [externalLink, setExternalLink] = useState<string | null>(null);

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
      const [minersRes, spacesRes, usersRes, poolsRes] = await Promise.all([
        fetch(minerUrl),
        fetch("/api/spaces"),
        fetch("/api/user/all"),
        fetch("/api/pools"),
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
            // Guildmasters hold their guild's miners.
            .filter(
              (user: User) =>
                user.role === "CLIENT" || user.role === "GUILDMASTER",
            )
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

      // Fetch pools
      if (poolsRes.ok) {
        const poolsData: ApiResponse<Pool[]> = await poolsRes.json();
        if (poolsData.success && poolsData.data) {
          setPools(poolsData.data);
        }
      }

      // Fetch external resource link separately without blocking
      fetch("/api/external-resource?key=hosted-miners-sheet")
        .then((res) => res.json())
        .then((data) => {
          if (data.resource?.url) {
            setExternalLink(data.resource.url);
          }
        })
        .catch((err) =>
          console.error("Failed to fetch external resource:", err),
        );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
   * Handle View Miner List
   */
  const handleViewMinerList = () => {
    if (externalLink) {
      window.open(externalLink, "_blank");
    } else {
      setError(
        "No external Google Sheet link has been configured for the Miner List yet. Configure this in External Resources setting",
      );
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
   * Handle benchmark filter change
   */
  const handleBenchmarkFilterChange = (event: SelectChangeEvent) => {
    setSelectedBenchmarkFilter(event.target.value);
  };

  /**
   * Handle pool filter change
   */
  const handlePoolFilterChange = (event: SelectChangeEvent) => {
    setSelectedPoolFilter(event.target.value);
  };

  /**
   * Handle segment (Type) filter change
   */
  const handleSegmentFilterChange = (event: SelectChangeEvent) => {
    setSelectedSegmentFilter(event.target.value);
  };

  /**
   * Handle warranty filter change
   */
  const handleWarrantyFilterChange = (event: SelectChangeEvent) => {
    setSelectedWarrantyFilter(event.target.value);
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
   * Get unique benchmark hashrates from miners (includes "No Benchmark" option)
   */
  const getUniqueBenchmarks = () => {
    const hasNoBenchmark = miners.some(
      (m) => m.benchmarkHashrate === undefined || m.benchmarkHashrate === null,
    );

    const benchmarks = new Set<number>();
    miners.forEach((m) => {
      if (m.benchmarkHashrate !== undefined && m.benchmarkHashrate !== null) {
        benchmarks.add(Number(m.benchmarkHashrate));
      }
    });

    const benchmarkOptions = Array.from(benchmarks)
      .sort((a, b) => a - b)
      .map((benchmark) => benchmark.toString());

    return hasNoBenchmark
      ? ["NO_BENCHMARK", ...benchmarkOptions]
      : benchmarkOptions;
  };

  /**
   * Get unique pools from miners (includes "Unassigned" option)
   */
  const getUniquePools = () => {
    // Check if there are any unassigned miners
    const hasUnassigned = miners.some((m) => !m.poolId);

    const poolOptions: Array<{ id: string; name: string }> = [];

    if (hasUnassigned) {
      poolOptions.push({ id: "UNASSIGNED", name: "Unassigned" });
    }

    // Add all available pools
    poolOptions.push(
      ...pools.map((pool) => ({
        id: pool.id,
        name: pool.name,
      })),
    );

    return poolOptions;
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

    // Filter by selected benchmark
    if (selectedBenchmarkFilter) {
      if (selectedBenchmarkFilter === "NO_BENCHMARK") {
        filtered = filtered.filter(
          (m) =>
            m.benchmarkHashrate === undefined || m.benchmarkHashrate === null,
        );
      } else {
        const targetBenchmark = parseFloat(selectedBenchmarkFilter);
        filtered = filtered.filter(
          (m) =>
            m.benchmarkHashrate !== undefined &&
            m.benchmarkHashrate !== null &&
            Math.abs(Number(m.benchmarkHashrate) - targetBenchmark) < 0.001,
        );
      }
    }

    // Filter by selected pool
    if (selectedPoolFilter) {
      if (selectedPoolFilter === "UNASSIGNED") {
        // Show only miners without a pool assignment
        filtered = filtered.filter((m) => !m.poolId);
      } else {
        // Show only miners with the selected pool
        filtered = filtered.filter((m) => m.poolId === selectedPoolFilter);
      }
    }

    // Filter by selected Type (user's segment)
    if (selectedSegmentFilter) {
      filtered = filtered.filter(
        (m) => m.user?.segment === selectedSegmentFilter,
      );
    }

    // Filter by warranty status (ACTIVE / EXPIRING / EXPIRED / NONE)
    if (selectedWarrantyFilter) {
      filtered = filtered.filter(
        (m) =>
          getWarrantyStatus(m.warrantyExpiresAt) === selectedWarrantyFilter,
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

  const filtered = getSortedFilteredMiners();
  const totalHashRate = filtered.reduce(
    (sum, m) => sum + parseFloat(String(m.hardware?.hashRate || 0)),
    0,
  );
  const totalPower = filtered.reduce(
    (sum, m) => sum + (m.hardware?.powerUsage || 0),
    0,
  );

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Miners Management"
        description="Manage and monitor all mining machines in your system."
        actions={
          <>
            <Button
              variant="outlined"
              onClick={handleViewMinerList}
              disabled={loading}
              sx={ds.outlineBtnSx}
            >
              View All Hosted Miner List
            </Button>
            <Button
              variant="outlined"
              onClick={() => setShowBulkEditModal(true)}
              disabled={loading || formOpen || filtered.length === 0}
              sx={ds.outlineBtnSx}
            >
              Bulk Edit
            </Button>
            <Button
              variant="outlined"
              onClick={() => setShowBulkDeleteModal(true)}
              disabled={loading || formOpen || filtered.length === 0}
              sx={ds.dangerOutlineBtnSx}
            >
              Bulk Delete
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleCreate}
              disabled={loading || formOpen}
              sx={ds.primaryBtnSx}
            >
              Add Miner
            </Button>
          </>
        }
      />

      {/* Error Message */}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3, ...ds.alertSx("error") }}
          onClose={() => setError(null)}
        >
          {error}
          {error.includes("Configure this in External Resources setting") && (
            <Button
              size="small"
              variant="outlined"
              sx={{ ...ds.dangerOutlineBtnSx, ml: 2, minHeight: 28 }}
              onClick={() => router.push("/external-resource")}
            >
              Here
            </Button>
          )}
        </Alert>
      )}

      {/* Loading State */}
      {loading ? (
        <DaylightLoading />
      ) : (
        <>
          {/* Filter Section */}
          <Box
            component="section"
            aria-labelledby="miner-filters-heading"
            sx={{ ...ds.cardSx, mb: { xs: "20px", md: "24px" } }}
          >
            <Typography
              id="miner-filters-heading"
              component="h2"
              sx={{ ...ds.sectionTitleSx, fontSize: 14, mb: "12px" }}
            >
              Filters
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(min(200px, 100%), 1fr))",
                gap: "12px",
                ...ds.inputSx,
              }}
            >
              <FormControl size="small" fullWidth>
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

              <FormControl size="small" fullWidth>
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

              <FormControl size="small" fullWidth>
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

              <FormControl size="small" fullWidth>
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

              <FormControl size="small" fullWidth>
                <InputLabel>Filter by Benchmark</InputLabel>
                <Select
                  value={selectedBenchmarkFilter}
                  onChange={handleBenchmarkFilterChange}
                  label="Filter by Benchmark"
                >
                  <MenuItem value="">
                    <em>All Benchmarks</em>
                  </MenuItem>
                  {getUniqueBenchmarks().map((benchmark) =>
                    benchmark === "NO_BENCHMARK" ? (
                      <MenuItem key={benchmark} value={benchmark}>
                        No Benchmark
                      </MenuItem>
                    ) : (
                      <MenuItem key={benchmark} value={benchmark}>
                        {parseFloat(benchmark).toFixed(2)} TH/s
                      </MenuItem>
                    ),
                  )}
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>Filter by Pool</InputLabel>
                <Select
                  value={selectedPoolFilter}
                  onChange={handlePoolFilterChange}
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

              <FormControl size="small" fullWidth>
                <InputLabel>Filter by Type</InputLabel>
                <Select
                  value={selectedSegmentFilter}
                  onChange={handleSegmentFilterChange}
                  label="Filter by Type"
                >
                  <MenuItem value="">
                    <em>All Types</em>
                  </MenuItem>
                  <MenuItem value="CORPORATE">Corporate</MenuItem>
                  <MenuItem value="SME">SME</MenuItem>
                  <MenuItem value="SELF_MINING">Self Mining</MenuItem>
                  <MenuItem value="FRANCHISEE">Franchisee</MenuItem>
                  <MenuItem value="RETAIL">Retail</MenuItem>
                  <MenuItem value="GUILDMASTER">Guildmaster</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>Filter by Warranty</InputLabel>
                <Select
                  value={selectedWarrantyFilter}
                  onChange={handleWarrantyFilterChange}
                  label="Filter by Warranty"
                >
                  <MenuItem value="">
                    <em>All Warranties</em>
                  </MenuItem>
                  <MenuItem value="ACTIVE">In warranty</MenuItem>
                  <MenuItem value="EXPIRING">
                    Expiring soon (≤ {WARRANTY_EXPIRING_DAYS} days)
                  </MenuItem>
                  <MenuItem value="EXPIRED">Expired</MenuItem>
                  <MenuItem value="NONE">Not recorded</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>

          {/* Stats */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(max(min(200px, 100%), calc((100% - 60px) / 4)), 1fr))",
              gap: { xs: "12px", sm: "16px", md: "20px" },
              mb: { xs: "20px", md: "24px" },
            }}
          >
            <AdminValueCard
              daylight
              title="Total Miners"
              value={filtered.length}
            />
            <AdminValueCard
              daylight
              title="Active Miners"
              value={filtered.filter((m) => m.status === "AUTO").length}
            />
            <AdminValueCard
              daylight
              title="Total Hash Rate"
              value={totalHashRate.toFixed(2)}
              subtitle="TH/s"
            />
            <AdminValueCard
              daylight
              title="Total Power Usage"
              value={totalPower.toFixed(2)}
              subtitle="kW"
            />
          </Box>

          {/* Miners Table */}
          <MinersTable
            miners={filtered}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isLoading={loading}
            error={tableError}
            showDeleted={showDeleted}
            setShowDeleted={setShowDeleted}
            csvExport
            daylight
          />
        </>
      )}

      {/* Miner Form Modal */}
      <MinerFormModal
        open={formOpen}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
        miner={selectedMiner}
        users={users}
        spaces={spaces}
        pools={pools}
        isLoading={loading}
      />

      {/* Bulk Edit Modal */}
      <BulkEditModal
        isOpen={showBulkEditModal}
        onClose={() => setShowBulkEditModal(false)}
        minerCount={getSortedFilteredMiners().length}
        spaces={spaces}
        pools={pools}
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
    </DaylightAdminPage>
  );
}
