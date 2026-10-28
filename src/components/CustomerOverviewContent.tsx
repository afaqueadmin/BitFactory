"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Alert,
  Menu,
  MenuItem,
  IconButton,
  Snackbar,
  FormControl,
  Select,
  TextField,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import {
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
} from "@mui/icons-material";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  sortCustomers,
  toggleSortDirection,
  type SortConfig,
  type CustomerSortField,
} from "@/lib/utils/sortCustomers";
import AdminValueCard from "@/components/admin/AdminValueCard";
import CreateUserModal from "@/components/CreateUserModal";
import EditCustomerModal from "@/components/EditCustomerModal";
import EditFranchiseeModal from "@/components/EditFranchiseeModal";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import ChangeAccountTypeModal from "@/components/ChangeAccountTypeModal";
import { canManageAccount } from "@/lib/auth/accountTiers";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";
import { actsAsClient, isGuildRole } from "@/lib/customerRoles";
import {
  DaylightAdminPage,
  DaylightLoading,
  DaylightPageHeader,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

interface FetchedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  city: string;
  country: string;
  phoneNumber: string;
  companyName: string;
  luxorSubaccounts: string[];
  pools: string;
  streetAddress: string;
  twoFactorEnabled: boolean;
  isDeleted: boolean;
  joinDate: string;
  miners: number;
  status: "active" | "inactive";
  balance: string;
  franchiseeId: string | null;
  segment: string | null;
}

interface FilterColumns {
  name: string;
  email: string;
  role: string;
  segment: string;
  pools: string;
  miners: string;
  status: string;
  joinDate: string;
  balance: string;
}

// Shape expected by EditFranchiseeModal — keyed on the Franchise record
// itself, not the User row, so a FRANCHISEE row's own Franchise must be
// looked up before this modal can be opened.
interface FranchiseData {
  id: string;
  businessName: string;
  authorizedPersonName: string;
  email: string;
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  isActive: boolean;
  franchisee: {
    id: string;
    name: string;
    email: string;
    luxorSubaccounts: string[];
  };
}

export default function CustomerOverviewContent() {
  const { d, fonts } = useDaylight();
  const ds = useDaylightAdminSx();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editFranchiseeModalOpen, setEditFranchiseeModalOpen] = useState(false);
  const [editFranchiseeData, setEditFranchiseeData] =
    useState<FranchiseData | null>(null);
  const [franchiseeLookupError, setFranchiseeLookupError] = useState("");
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [accountTypeModalOpen, setAccountTypeModalOpen] = useState(false);
  const [accountTypeTarget, setAccountTypeTarget] = useState<
    "FRANCHISEE" | "SIMULATED"
  >("FRANCHISEE");
  const [showDeleted, setShowDeleted] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<FetchedUser | null>(
    null,
  );
  const [responseNotification, setResponseNotification] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: "name",
    direction: "asc",
  });
  const [customerStats, setCustomerStats] = useState({
    totalCustomers: 0,
    activeCustomers: 0,
    totalRevenue: 0,
    totalMiners: 0,
  });

  // Fetch current user profile
  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["userProfile"],
    queryFn: async () => {
      const response = await fetch("/api/user/profile", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch user profile");
      }

      return response.json();
    },
  });

  const currentUserRole = profileData?.user?.role || "ADMIN";

  // Fetch all users
  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ["userAll", showDeleted],
    queryFn: async () => {
      const url = new URL("/api/user/all", window.location.origin);
      if (showDeleted) {
        url.searchParams.append("isDeleted", "true");
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }

      const data = await response.json();

      if (!data.users) {
        throw new Error("No users data returned");
      }

      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const loading = profileLoading || usersLoading;
  const error = usersError
    ? "Failed to load customers. Please try again."
    : null;

  // Process users and generate chart data
  const { users, chartData } = useMemo(() => {
    if (!usersData?.users || !currentUserRole) {
      return { users: [], chartData: [] };
    }

    let filteredUsers = usersData.users;

    // ADMIN (and ACCOUNTING) can see CLIENT, FRANCHISEE and guild users
    if (currentUserRole === "ADMIN" || currentUserRole === "ACCOUNTING") {
      filteredUsers = usersData.users.filter(
        (user: FetchedUser) =>
          user.role === "CLIENT" ||
          user.role === "FRANCHISEE" ||
          isGuildRole(user.role),
      );
    }
    // SUPER_ADMIN also sees ADMIN and ACCOUNTING users
    else if (currentUserRole === "SUPER_ADMIN") {
      filteredUsers = usersData.users.filter(
        (user: FetchedUser) =>
          user.role === "CLIENT" ||
          user.role === "ADMIN" ||
          user.role === "ACCOUNTING" ||
          user.role === "FRANCHISEE" ||
          isGuildRole(user.role),
      );
    }

    // Calculate stats
    const totalMiners = filteredUsers.reduce(
      (sum: number, user: FetchedUser) => sum + user.miners,
      0,
    );
    const activeCount = filteredUsers.filter(
      (user: FetchedUser) => user.status === "active",
    ).length;

    setCustomerStats({
      totalCustomers: filteredUsers.length,
      activeCustomers: activeCount,
      totalRevenue: usersData.totalRevenue || 0,
      totalMiners: totalMiners,
    });

    /**
     * Aggregate customer data by creation date for chart
     */
    const aggregateCustomersByDate = (customers: FetchedUser[]) => {
      const dateMap = new Map<string, number>();

      // Sort by createdAt and count cumulative customers
      const sortedCustomers = [...customers].sort(
        (a, b) =>
          new Date(a.joinDate).getTime() - new Date(b.joinDate).getTime(),
      );

      let cumulativeCount = 0;
      sortedCustomers.forEach((customer) => {
        const date = new Date(customer.joinDate).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

        cumulativeCount += 1;
        dateMap.set(date, cumulativeCount);
      });

      // Convert to array and sort by date
      return Array.from(dateMap, ([date, count]) => ({ date, count })).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
    };

    // Generate chart data
    const chartData = aggregateCustomersByDate(filteredUsers);

    return { users: filteredUsers, chartData };
  }, [usersData, currentUserRole]);

  const handleUserCreated = (resNotification: string) => {
    setResponseNotification(resNotification);
    // Refresh the customer list/stats
    refetchUsers();
  };

  /**
   * Handle header cell click to sort
   */
  const handleHeaderClick = (field: CustomerSortField) => {
    if (sortConfig.field === field) {
      // Same field clicked - toggle direction
      setSortConfig({
        ...sortConfig,
        direction: toggleSortDirection(sortConfig.direction),
      });
    } else {
      // New field clicked - sort ascending
      setSortConfig({ field, direction: "asc" });
    }
  };

  const [filters, setFilters] = useState<FilterColumns>({
    name: "",
    email: "",
    role: "",
    segment: "",
    pools: "",
    miners: "",
    status: "",
    joinDate: "",
    balance: "",
  });

  const searchParams = useSearchParams();

  // Read balance filter from URL query parameter and set it
  useEffect(() => {
    const balanceFilter = searchParams.get("balanceFilter");
    if (balanceFilter) {
      setFilters((prev) => ({ ...prev, balance: balanceFilter }));
    }
  }, [searchParams]);

  const handleFilterChange = (column: keyof FilterColumns, value: string) => {
    setFilters((prev) => ({ ...prev, [column]: value }));
  };

  const filteredRows = useMemo<FetchedUser[]>(
    () =>
      users.filter((row: FetchedUser) =>
        (Object.keys(filters) as Array<keyof FilterColumns>).every((column) => {
          if (column === "balance") {
            const filterValue =
              filters[column] === "> 0"
                ? "positive"
                : filters[column] === "< 0"
                  ? "negative"
                  : "";
            if (filterValue === "positive") {
              return row[column].toString() > "0";
            } else if (filterValue === "negative") {
              return row[column].toString() < "0";
            }
          }

          const searchValue = filters[column].toLowerCase();
          return (row[column] ?? "")
            .toString()
            .toLowerCase()
            .includes(searchValue);
        }),
      ),
    [filters, users],
  );

  /**
   * Memoized sorted customers
   */
  const sortedUsers = useMemo(
    () => sortCustomers(filteredRows, sortConfig),
    [filteredRows, sortConfig],
  );

  const handleMenuOpen = (
    event: React.MouseEvent<HTMLButtonElement>,
    customer: FetchedUser,
  ) => {
    setAnchorEl(event.currentTarget);
    setSelectedCustomer(customer);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    // setSelectedCustomer(null);
  };

  const handleEditCustomer = async () => {
    if (!selectedCustomer) {
      handleMenuClose();
      return;
    }

    if (selectedCustomer.role === "FRANCHISEE") {
      handleMenuClose();
      setFranchiseeLookupError("");
      try {
        const response = await fetch("/api/franchisees");
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load franchise details");
        }

        const franchises: FranchiseData[] = Array.isArray(data.data)
          ? data.data
          : [];
        const match = franchises.find(
          (f) => f.franchisee.id === selectedCustomer.id,
        );

        if (!match) {
          throw new Error(
            "Could not find a franchise record for this franchisee",
          );
        }

        setEditFranchiseeData(match);
        setEditFranchiseeModalOpen(true);
      } catch (err) {
        setFranchiseeLookupError(
          err instanceof Error
            ? err.message
            : "Failed to load franchise details",
        );
      }
      return;
    }

    setEditModalOpen(true);
    handleMenuClose();
  };

  const handleChangePassword = () => {
    if (selectedCustomer) {
      setChangePasswordModalOpen(true);
    }
    handleMenuClose();
  };

  // Same tier rule the API enforces (src/lib/auth/accountTiers.ts) for
  // password resets, sign-outs and deletion.
  const canManage = (target: FetchedUser | null) =>
    !!target && canManageAccount(currentUserRole, target.role);

  const handleSignOutEverywhere = async () => {
    if (!selectedCustomer) return;
    const target = selectedCustomer;
    handleMenuClose();

    if (
      !window.confirm(
        `Sign "${target.name}" out on all devices? They will need to log in again.`,
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `/api/user/${target.id}/sign-out-everywhere`,
        { method: "POST" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to sign the user out");
      }
      setResponseNotification(data.message || "User signed out on all devices");
    } catch (err) {
      setResponseNotification(
        err instanceof Error ? err.message : "Failed to sign the user out",
      );
    }
  };

  const handleDeleteCustomer = async () => {
    if (!selectedCustomer) return;

    // Confirm deletion
    if (
      !window.confirm(
        `Are you sure you want to delete customer "${selectedCustomer.name}"? This action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/user/${selectedCustomer.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete customer");
      }

      setResponseNotification("Customer deleted successfully");
      handleMenuClose();
      // Refresh the customer list
      await refetchUsers();
    } catch (err) {
      setResponseNotification(
        err instanceof Error ? err.message : "Failed to delete customer",
      );
    }
  };

  const handleRestoreCustomer = async () => {
    if (!selectedCustomer) return;
    const target = selectedCustomer;
    handleMenuClose();

    if (!window.confirm(`Restore customer "${target.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/user/${target.id}/restore`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to restore customer");
      }
      setResponseNotification("Customer restored successfully");
      await refetchUsers();
    } catch (err) {
      setResponseNotification(
        `Failed to restore customer: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
    }
  };

  const handleChangeAccountType = (
    target: "FRANCHISEE" | "SIMULATED" = "FRANCHISEE",
  ) => {
    if (selectedCustomer) {
      setAccountTypeTarget(target);
      setAccountTypeModalOpen(true);
    }
    handleMenuClose();
  };

  const handleModalClose = () => {
    setEditModalOpen(false);
    setChangePasswordModalOpen(false);
    setAccountTypeModalOpen(false);
    setSelectedCustomer(null);
  };

  const handleFranchiseeModalClose = () => {
    setEditFranchiseeModalOpen(false);
    setEditFranchiseeData(null);
    setSelectedCustomer(null);
  };

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Customer Overview"
        description="Every customer, franchisee and simulated account, with balances, miners and status."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateModalOpen(true)}
            sx={ds.primaryBtnSx}
          >
            Create User
          </Button>
        }
      />

      {/* Create User Modal */}
      <CreateUserModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={handleUserCreated}
      />

      {/* Edit Customer Modal */}
      {selectedCustomer && (
        <EditCustomerModal
          open={editModalOpen}
          onClose={handleModalClose}
          onSuccess={handleUserCreated}
          customerId={selectedCustomer.id}
          initialData={selectedCustomer}
        />
      )}

      {/* Edit Franchisee Modal - used instead of EditCustomerModal when the
          selected row is a FRANCHISEE, since the underlying data shape
          (Franchise record, not just a User row) differs. */}
      <EditFranchiseeModal
        open={editFranchiseeModalOpen}
        onClose={handleFranchiseeModalClose}
        onSuccess={handleUserCreated}
        franchise={editFranchiseeData}
      />

      <Snackbar
        open={Boolean(franchiseeLookupError)}
        autoHideDuration={5000}
        onClose={() => setFranchiseeLookupError("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setFranchiseeLookupError("")}
          severity="error"
          sx={ds.alertSx("error")}
        >
          {franchiseeLookupError}
        </Alert>
      </Snackbar>

      {/* Change Password Modal */}
      {selectedCustomer && (
        <ChangePasswordModal
          open={changePasswordModalOpen}
          onClose={handleModalClose}
          onSuccess={handleUserCreated}
          customerId={selectedCustomer.id}
        />
      )}

      {/* Change Account Type Modal - franchisee <-> regular customer */}
      <ChangeAccountTypeModal
        open={accountTypeModalOpen}
        onClose={handleModalClose}
        onSuccess={handleUserCreated}
        customer={selectedCustomer}
        target={accountTypeTarget}
      />

      <Snackbar
        open={Boolean(responseNotification)}
        autoHideDuration={5000}
        onClose={() => setResponseNotification("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setResponseNotification("")}
          severity={
            responseNotification.toLowerCase().includes("failed")
              ? "error"
              : "success"
          }
          sx={{
            width: "100%",
            ...ds.alertSx(
              responseNotification.toLowerCase().includes("failed")
                ? "error"
                : "success",
            ),
          }}
        >
          {responseNotification}
        </Alert>
      </Snackbar>

      {/* Stats Cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fill, minmax(max(min(240px, 100%), calc((100% - 60px) / 4)), 1fr))",
          gap: { xs: "12px", sm: "16px", md: "20px" },
          mb: { xs: "20px", md: "24px" },
        }}
      >
        <AdminValueCard
          daylight
          title="Total Customers"
          value={customerStats.totalCustomers}
          type="number"
        />
        <AdminValueCard
          daylight
          title="Active Customers"
          value={customerStats.activeCustomers}
          type="number"
        />
        <AdminValueCard
          daylight
          title="Total Prepaid Balance Added"
          value={customerStats.totalRevenue}
          type="currency"
          subtitle="USD"
        />
        <AdminValueCard
          daylight
          title="Total Miners"
          value={customerStats.totalMiners}
          type="number"
        />
      </Box>

      {/* Customer Activity */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: "16px", sm: "20px 24px" },
          mb: { xs: "20px", md: "24px" },
          bgcolor: d.surface,
          backgroundImage: "none",
          border: `1px solid ${d.border}`,
          borderRadius: RADIUS_CARD,
          boxShadow: d.shadow,
          fontFamily: fonts.body,
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
            mb: "12px",
          }}
        >
          <Typography
            component="h2"
            sx={{
              m: 0,
              fontFamily: fonts.heading,
              fontWeight: 700,
              fontSize: 16,
              color: d.text,
            }}
          >
            Recent Customers
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
                sx={{
                  color: d.inputBorder,
                  "&.Mui-checked": { color: d.action },
                }}
              />
            }
            label="Show Deleted"
            sx={{
              mr: 0,
              "& .MuiFormControlLabel-label": {
                fontFamily: fonts.body,
                fontSize: 13,
                color: d.muted,
              },
            }}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2, ...ds.alertSx("error") }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <DaylightLoading />
        ) : users.length === 0 ? (
          <Typography sx={{ p: 2, fontSize: 13, color: d.muted }}>
            No customers found
          </Typography>
        ) : (
          <TableContainer sx={ds.tableSx}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      fontWeight: "bold",
                      cursor: "pointer",
                      userSelect: "none",
                      "&:hover": { backgroundColor: d.hover, color: d.text },
                      whiteSpace: "nowrap",
                    }}
                    onClick={() => handleHeaderClick("name")}
                  >
                    Customer{" "}
                    {sortConfig.field === "name" &&
                      (sortConfig.direction === "asc" ? (
                        <ArrowUpwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ) : (
                        <ArrowDownwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ))}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: "bold",
                      cursor: "pointer",
                      userSelect: "none",
                      "&:hover": { backgroundColor: d.hover, color: d.text },
                      whiteSpace: "nowrap",
                    }}
                    onClick={() => handleHeaderClick("email")}
                  >
                    Email{" "}
                    {sortConfig.field === "email" &&
                      (sortConfig.direction === "asc" ? (
                        <ArrowUpwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ) : (
                        <ArrowDownwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ))}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: "bold",
                      cursor: "pointer",
                      userSelect: "none",
                      "&:hover": { backgroundColor: d.hover, color: d.text },
                      whiteSpace: "nowrap",
                    }}
                    onClick={() => handleHeaderClick("role")}
                  >
                    Role{" "}
                    {sortConfig.field === "role" &&
                      (sortConfig.direction === "asc" ? (
                        <ArrowUpwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ) : (
                        <ArrowDownwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ))}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: "bold",
                      cursor: "pointer",
                      userSelect: "none",
                      "&:hover": { backgroundColor: d.hover, color: d.text },
                      whiteSpace: "nowrap",
                    }}
                    onClick={() => handleHeaderClick("segment")}
                  >
                    Type{" "}
                    {sortConfig.field === "segment" &&
                      (sortConfig.direction === "asc" ? (
                        <ArrowUpwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ) : (
                        <ArrowDownwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ))}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: "bold",
                      cursor: "pointer",
                      userSelect: "none",
                      "&:hover": { backgroundColor: d.hover, color: d.text },
                      whiteSpace: "nowrap",
                    }}
                    onClick={() => handleHeaderClick("pools")}
                  >
                    Pools{" "}
                    {sortConfig.field === "pools" &&
                      (sortConfig.direction === "asc" ? (
                        <ArrowUpwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ) : (
                        <ArrowDownwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ))}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: "bold",
                      cursor: "pointer",
                      userSelect: "none",
                      "&:hover": { backgroundColor: d.hover, color: d.text },
                      whiteSpace: "nowrap",
                    }}
                    align="center"
                    onClick={() => handleHeaderClick("miners")}
                  >
                    Miners{" "}
                    {sortConfig.field === "miners" &&
                      (sortConfig.direction === "asc" ? (
                        <ArrowUpwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ) : (
                        <ArrowDownwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ))}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: "bold",
                      cursor: "pointer",
                      userSelect: "none",
                      "&:hover": { backgroundColor: d.hover, color: d.text },
                      whiteSpace: "nowrap",
                    }}
                    align="center"
                    onClick={() => handleHeaderClick("status")}
                  >
                    Status{" "}
                    {sortConfig.field === "status" &&
                      (sortConfig.direction === "asc" ? (
                        <ArrowUpwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ) : (
                        <ArrowDownwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ))}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: "bold",
                      cursor: "pointer",
                      userSelect: "none",
                      "&:hover": { backgroundColor: d.hover, color: d.text },
                      whiteSpace: "nowrap",
                    }}
                    onClick={() => handleHeaderClick("joinDate")}
                  >
                    Join Date{" "}
                    {sortConfig.field === "joinDate" &&
                      (sortConfig.direction === "asc" ? (
                        <ArrowUpwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ) : (
                        <ArrowDownwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ))}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: "bold",
                      cursor: "pointer",
                      userSelect: "none",
                      "&:hover": { backgroundColor: d.hover, color: d.text },
                      whiteSpace: "nowrap",
                    }}
                    onClick={() => handleHeaderClick("balance")}
                  >
                    Balance{" "}
                    {sortConfig.field === "balance" &&
                      (sortConfig.direction === "asc" ? (
                        <ArrowUpwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ) : (
                        <ArrowDownwardIcon
                          sx={{ fontSize: 13, verticalAlign: "-2px", ml: 0.5 }}
                        />
                      ))}
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: "bold" }}>
                    Actions
                  </TableCell>
                </TableRow>
                <TableRow
                  sx={{
                    ...ds.inputSx,
                    "& .MuiTableCell-head": { py: "8px" },
                    "& .MuiOutlinedInput-root": {
                      ...ds.inputSx["& .MuiOutlinedInput-root"],
                      fontSize: 12.5,
                      textTransform: "none",
                    },
                  }}
                >
                  {(Object.keys(filters) as Array<keyof FilterColumns>).map(
                    (column) => (
                      <TableCell key={column}>
                        {column === "balance" ? (
                          <FormControl size="small" sx={{ minWidth: 100 }}>
                            <Select
                              value={filters[column]}
                              onChange={(e) =>
                                handleFilterChange(column, e.target.value)
                              }
                            >
                              <MenuItem value="">All</MenuItem>
                              <MenuItem value="> 0">&gt; 0</MenuItem>
                              <MenuItem value="< 0">&lt; 0</MenuItem>
                            </Select>
                          </FormControl>
                        ) : (
                          <TextField
                            // placeholder={column}
                            size="small"
                            value={filters[column]}
                            onChange={(e) =>
                              handleFilterChange(column, e.target.value)
                            }
                          />
                        )}
                      </TableCell>
                    ),
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedUsers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell
                      component="th"
                      scope="row"
                      sx={{
                        fontFamily: fonts.body,
                        fontSize: 13,
                        borderBottomColor: d.border,
                      }}
                    >
                      <Link
                        href={`/customers/${customer.id}`}
                        style={{
                          textDecoration: "none",
                          color: "inherit",
                        }}
                      >
                        <Typography
                          component="span"
                          sx={{
                            color: customer.isDeleted ? d.danger : d.action,
                            fontFamily: fonts.body,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            "&:hover": {
                              textDecoration: "underline",
                            },
                          }}
                        >
                          {customer.name}
                        </Typography>
                      </Link>
                    </TableCell>
                    <TableCell>{customer.email}</TableCell>
                    <TableCell>{customer.role}</TableCell>
                    <TableCell>
                      {customer.segment === "POTENTIAL_CUSTOMER" ? (
                        <DaylightStatusPill
                          label="Potential Customer"
                          tone="info"
                        />
                      ) : customer.segment === "GUILDMASTER" ? (
                        "Guildmaster"
                      ) : (
                        (customer.segment ?? "—")
                      )}
                    </TableCell>
                    <TableCell>{customer.pools || "Not Set"}</TableCell>
                    <TableCell align="center">{customer.miners}</TableCell>
                    <TableCell align="center">
                      <DaylightStatusPill
                        label={
                          customer.status === "active" ? "Active" : "Inactive"
                        }
                        tone={
                          customer.status === "active" ? "success" : "neutral"
                        }
                      />
                    </TableCell>
                    <TableCell sx={{ "&&&": { whiteSpace: "nowrap" } }}>
                      {customer.joinDate}
                    </TableCell>
                    <TableCell>
                      {actsAsClient(customer.role) ? customer.balance : "-"}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        aria-label={`Actions for ${customer.name}`}
                        onClick={(e) => handleMenuOpen(e, customer)}
                        sx={{
                          color: d.muted,
                          borderRadius: "8px",
                          "&:hover": { bgcolor: d.hover, color: d.action },
                        }}
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              minWidth: 220,
              borderRadius: "12px",
              border: `1px solid ${d.border}`,
              bgcolor: d.surface,
              backgroundImage: "none",
              boxShadow: "0 8px 30px rgba(100,114,124,.13)",
              "& .MuiMenuItem-root": {
                minHeight: 40,
                fontFamily: fonts.body,
                fontSize: 13,
                fontWeight: 500,
                color: d.text,
                "&:hover": { bgcolor: d.hover },
              },
            },
          },
        }}
      >
        <MenuItem onClick={handleEditCustomer}>Edit Customer</MenuItem>
        <MenuItem onClick={handleChangePassword}>Change Password</MenuItem>
        <MenuItem
          onClick={handleSignOutEverywhere}
          disabled={!canManage(selectedCustomer)}
        >
          Sign Out All Devices
        </MenuItem>
        {(selectedCustomer?.role === "CLIENT" ||
          selectedCustomer?.role === "FRANCHISEE") && (
          <MenuItem
            onClick={() => handleChangeAccountType("FRANCHISEE")}
            disabled={
              selectedCustomer.isDeleted || !canManage(selectedCustomer)
            }
          >
            {selectedCustomer.role === "FRANCHISEE"
              ? "Change to Regular Customer"
              : "Change to Franchisee"}
          </MenuItem>
        )}
        {selectedCustomer?.role === "CLIENT" && (
          <MenuItem
            onClick={() => handleChangeAccountType("SIMULATED")}
            disabled={
              selectedCustomer.isDeleted || !canManage(selectedCustomer)
            }
          >
            Change to Simulated Account
          </MenuItem>
        )}
        {selectedCustomer?.isDeleted ? (
          <MenuItem
            onClick={handleRestoreCustomer}
            sx={{ color: `${d.success} !important` }}
            disabled={!canManage(selectedCustomer)}
          >
            Restore Customer
          </MenuItem>
        ) : (
          <MenuItem
            onClick={handleDeleteCustomer}
            sx={{ color: `${d.danger} !important` }}
            disabled={!selectedCustomer || !canManage(selectedCustomer)}
          >
            Delete Customer
          </MenuItem>
        )}
      </Menu>

      {/* Activity Chart Section */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: "16px", sm: "20px 24px" },
          bgcolor: d.surface,
          backgroundImage: "none",
          border: `1px solid ${d.border}`,
          borderRadius: RADIUS_CARD,
          boxShadow: d.shadow,
          fontFamily: fonts.body,
        }}
      >
        <Typography
          component="h2"
          sx={{
            m: "0 0 12px",
            fontFamily: fonts.heading,
            fontWeight: 700,
            fontSize: 16,
            color: d.text,
          }}
        >
          Customer Growth
        </Typography>
        {chartData.length === 0 ? (
          <Box
            sx={{
              height: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography sx={{ fontSize: 13, color: d.muted }}>
              No customer data available for chart
            </Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
            >
              <CartesianGrid stroke={d.border} vertical={false} />
              <XAxis
                dataKey="date"
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fill: d.muted, fontSize: 11, fontFamily: fonts.body }}
                tickLine={false}
                axisLine={{ stroke: d.border }}
                interval={
                  chartData.length > 10 ? Math.floor(chartData.length / 10) : 0
                }
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: d.muted, fontSize: 11, fontFamily: fonts.body }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                formatter={(value) => [`${value} customers`, "Total"]}
                labelFormatter={(label) => `Date: ${label}`}
                cursor={{ stroke: d.inputBorder, strokeDasharray: "3 3" }}
                contentStyle={{
                  background: d.surface,
                  border: `1px solid ${d.border}`,
                  borderRadius: 10,
                  boxShadow: "0 8px 30px rgba(100,114,124,.13)",
                  fontFamily: fonts.body,
                  fontSize: 12,
                  color: d.text,
                }}
                labelStyle={{ color: d.muted, marginBottom: 4 }}
                itemStyle={{ color: d.text }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke={d.chartLine}
                dot={false}
                activeDot={{ r: 5, stroke: d.surface, strokeWidth: 2 }}
                name="Total Customers"
                strokeWidth={2}
                isAnimationActive={true}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Paper>
    </DaylightAdminPage>
  );
}
