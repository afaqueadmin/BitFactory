"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
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
  CircularProgress,
  Alert,
  Menu,
  MenuItem,
  IconButton,
  Snackbar,
  // FormControl,
  // Select,
  TextField,
} from "@mui/material";
import {
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
} from "@mui/icons-material";
import {
  sortCustomers,
  toggleSortDirection,
  // getSortFieldLabel,
  // getAllSortFields,
  type SortConfig,
  type CustomerSortField,
} from "@/lib/utils/sortCustomers";
import AdminValueCard from "@/components/admin/AdminValueCard";
import CreateUserModal from "@/components/CreateUserModal";
import EditCustomerModal from "@/components/EditCustomerModal";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import AddPaymentModal from "@/components/AddPaymentModal";
import AddAdjustmentModal from "@/components/AddAdjustmentModal";

interface FetchedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  city: string;
  country: string;
  phoneNumber: string;
  companyName: string;
  luxorSubaccountName: string;
  streetAddress: string;
  twoFactorEnabled: boolean;
  joinDate: string;
  miners: number;
  status: "active" | "inactive";
}

interface FilterColumns {
  name: string;
  email: string;
  role: string;
  luxorSubaccountName: string;
  miners: string;
  status: string;
  joinDate: string;
}

// Create a Grid component that includes the 'item' prop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Grid = MuiGrid as React.ComponentType<any>;

export default function CustomerOverview() {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [addPaymentModalOpen, setAddPaymentModalOpen] = useState(false);
  const [addAdjustmentModalOpen, setAddAdjustmentModalOpen] = useState(false);
  const [users, setUsers] = useState<FetchedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
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

  useEffect(() => {
    const initializeUsers = async () => {
      await fetchCurrentUserRole();
    };
    initializeUsers();
  }, []);

  useEffect(() => {
    if (currentUserRole) {
      fetchUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserRole]);

  const fetchCurrentUserRole = async () => {
    try {
      const response = await fetch("/api/user/profile", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentUserRole(data.user?.role || "ADMIN");
      }
    } catch (err) {
      console.error("Error fetching current user role:", err);
      setCurrentUserRole("ADMIN");
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/user/all", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }

      const data = await response.json();

      if (data.users) {
        // Filter users based on current user's role
        let filteredUsers = data.users;

        // ADMIN can only see CLIENT users
        if (currentUserRole === "ADMIN") {
          filteredUsers = data.users.filter(
            (user: FetchedUser) => user.role === "CLIENT",
          );
        }
        // SUPER_ADMIN can see both CLIENT and ADMIN users
        else if (currentUserRole === "SUPER_ADMIN") {
          filteredUsers = data.users.filter(
            (user: FetchedUser) =>
              user.role === "CLIENT" || user.role === "ADMIN",
          );
        }

        setUsers(filteredUsers);

        // Calculate stats based on filtered users
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
          totalRevenue: data.totalRevenue, // Revenue calculation would depend on your business logic
          totalMiners: totalMiners,
        });
      }
    } catch (err) {
      console.error("Error fetching users:", err);
      setError("Failed to load customers. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUserCreated = (resNotification: string) => {
    setResponseNotification(resNotification);
    // Refresh the customer list/stats
    if (!currentUserRole) {
      fetchCurrentUserRole();
    }
    fetchUsers();
  };

  // /**
  //  * Handle sort field change from dropdown
  //  */
  // const handleSortFieldChange = (
  //   event: SelectChangeEvent<CustomerSortField>,
  // ) => {
  //   const newField = event.target.value as CustomerSortField;
  //   setSortConfig({ field: newField, direction: "asc" });
  // };

  /**
   * Handle sort direction toggle
   */
  // const handleSortDirectionToggle = () => {
  //   setSortConfig({
  //     ...sortConfig,
  //     direction: toggleSortDirection(sortConfig.direction),
  //   });
  // };

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
    luxorSubaccountName: "",
    miners: "",
    status: "",
    joinDate: "",
  });

  const handleFilterChange = (column: keyof FilterColumns, value: string) => {
    setFilters((prev) => ({ ...prev, [column]: value }));
  };

  const filteredRows = useMemo(
    () =>
      users.filter((row) =>
        (Object.keys(filters) as Array<keyof FilterColumns>).every((column) => {
          const searchValue = filters[column].toLowerCase();
          return row[column].toString().toLowerCase().includes(searchValue);
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

  const handleEditCustomer = () => {
    if (selectedCustomer) {
      setEditModalOpen(true);
    }
    handleMenuClose();
  };

  const handleChangePassword = () => {
    if (selectedCustomer) {
      setChangePasswordModalOpen(true);
    }
    handleMenuClose();
  };

  const handleAddPayment = () => {
    if (selectedCustomer) {
      setAddPaymentModalOpen(true);
    }
    handleMenuClose();
  };

  const handleCreateAdjustment = () => {
    if (selectedCustomer) {
      setAddAdjustmentModalOpen(true);
    }
    handleMenuClose();
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

    setLoading(true);
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

      setError(null);
      // Refresh the customer list
      await fetchUsers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete customer",
      );
    } finally {
      setLoading(false);
      handleMenuClose();
    }
  };

  const handleModalClose = () => {
    setEditModalOpen(false);
    setChangePasswordModalOpen(false);
    setAddPaymentModalOpen(false);
    setAddAdjustmentModalOpen(false);
    setSelectedCustomer(null);
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

      {/* Change Password Modal */}
      {selectedCustomer && (
        <ChangePasswordModal
          open={changePasswordModalOpen}
          onClose={handleModalClose}
          onSuccess={handleUserCreated}
          customerId={selectedCustomer.id}
        />
      )}

      {/* Add Payment Modal */}
      {selectedCustomer && (
        <AddPaymentModal
          open={addPaymentModalOpen}
          onClose={handleModalClose}
          onSuccess={handleUserCreated}
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name}
        />
      )}

      {/* Add Adjustment Modal */}
      {selectedCustomer && (
        <AddAdjustmentModal
          open={addAdjustmentModalOpen}
          onClose={handleModalClose}
          onSuccess={handleUserCreated}
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name}
        />
      )}

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
          sx={{ width: "100%" }}
        >
          {responseNotification}
        </Alert>
      </Snackbar>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <AdminValueCard
            title="Total Customers"
            value={customerStats.totalCustomers}
            type="number"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <AdminValueCard
            title="Active Customers"
            value={customerStats.activeCustomers}
            type="number"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <AdminValueCard
            title="Total Revenue"
            value={customerStats.totalRevenue}
            type="currency"
            subtitle="USD"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <AdminValueCard
            title="Total Miners"
            value={customerStats.totalMiners}
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

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
            <CircularProgress />
          </Box>
        ) : users.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            No customers found
          </Typography>
        ) : (
          <>
            {/* Sort Controls */}
            {/*<Box*/}
            {/*  sx={{*/}
            {/*    display: "flex",*/}
            {/*    justifyContent: "flex-start",*/}
            {/*    alignItems: "center",*/}
            {/*    mb: 2,*/}
            {/*    flexWrap: "wrap",*/}
            {/*    gap: 2,*/}
            {/*  }}*/}
            {/*>*/}
            {/*  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>*/}
            {/*    <Typography variant="body2" sx={{ fontWeight: "600" }}>*/}
            {/*      Sort by:*/}
            {/*    </Typography>*/}
            {/*    <FormControl sx={{ minWidth: 200 }}>*/}
            {/*      <Select*/}
            {/*        value={sortConfig.field}*/}
            {/*        onChange={handleSortFieldChange}*/}
            {/*        size="small"*/}
            {/*      >*/}
            {/*        {getAllSortFields().map((field) => (*/}
            {/*          <MenuItem key={field} value={field}>*/}
            {/*            {getSortFieldLabel(field)}*/}
            {/*          </MenuItem>*/}
            {/*        ))}*/}
            {/*      </Select>*/}
            {/*    </FormControl>*/}
            {/*    <Button*/}
            {/*      size="small"*/}
            {/*      onClick={handleSortDirectionToggle}*/}
            {/*      startIcon={*/}
            {/*        sortConfig.direction === "asc" ? (*/}
            {/*          <ArrowUpwardIcon fontSize="small" />*/}
            {/*        ) : (*/}
            {/*          <ArrowDownwardIcon fontSize="small" />*/}
            {/*        )*/}
            {/*      }*/}
            {/*      variant="outlined"*/}
            {/*      sx={{ textTransform: "capitalize" }}*/}
            {/*    >*/}
            {/*      {sortConfig.direction === "asc" ? "Asc" : "Desc"}*/}
            {/*    </Button>*/}
            {/*  </Box>*/}
            {/*</Box>*/}

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{
                        fontWeight: "bold",
                        cursor: "pointer",
                        userSelect: "none",
                        "&:hover": { backgroundColor: "action.selected" },
                        whiteSpace: "nowrap",
                      }}
                      onClick={() => handleHeaderClick("name")}
                    >
                      Customer{" "}
                      {sortConfig.field === "name" &&
                        (sortConfig.direction === "asc" ? (
                          <ArrowUpwardIcon
                            fontSize="small"
                            sx={{ verticalAlign: "middle", ml: 0.5 }}
                          />
                        ) : (
                          <ArrowDownwardIcon
                            fontSize="small"
                            sx={{ verticalAlign: "middle", ml: 0.5 }}
                          />
                        ))}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: "bold",
                        cursor: "pointer",
                        userSelect: "none",
                        "&:hover": { backgroundColor: "action.selected" },
                        whiteSpace: "nowrap",
                      }}
                      onClick={() => handleHeaderClick("email")}
                    >
                      Email{" "}
                      {sortConfig.field === "email" &&
                        (sortConfig.direction === "asc" ? (
                          <ArrowUpwardIcon
                            fontSize="small"
                            sx={{ verticalAlign: "middle", ml: 0.5 }}
                          />
                        ) : (
                          <ArrowDownwardIcon
                            fontSize="small"
                            sx={{ verticalAlign: "middle", ml: 0.5 }}
                          />
                        ))}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: "bold",
                        cursor: "pointer",
                        userSelect: "none",
                        "&:hover": { backgroundColor: "action.selected" },
                        whiteSpace: "nowrap",
                      }}
                      onClick={() => handleHeaderClick("role")}
                    >
                      Role{" "}
                      {sortConfig.field === "role" &&
                        (sortConfig.direction === "asc" ? (
                          <ArrowUpwardIcon
                            fontSize="small"
                            sx={{ verticalAlign: "middle", ml: 0.5 }}
                          />
                        ) : (
                          <ArrowDownwardIcon
                            fontSize="small"
                            sx={{ verticalAlign: "middle", ml: 0.5 }}
                          />
                        ))}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: "bold",
                        cursor: "pointer",
                        userSelect: "none",
                        "&:hover": { backgroundColor: "action.selected" },
                        whiteSpace: "nowrap",
                      }}
                      onClick={() => handleHeaderClick("luxorSubaccount")}
                    >
                      Luxor Subaccount{" "}
                      {sortConfig.field === "luxorSubaccount" &&
                        (sortConfig.direction === "asc" ? (
                          <ArrowUpwardIcon
                            fontSize="small"
                            sx={{ verticalAlign: "middle", ml: 0.5 }}
                          />
                        ) : (
                          <ArrowDownwardIcon
                            fontSize="small"
                            sx={{ verticalAlign: "middle", ml: 0.5 }}
                          />
                        ))}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: "bold",
                        cursor: "pointer",
                        userSelect: "none",
                        "&:hover": { backgroundColor: "action.selected" },
                        whiteSpace: "nowrap",
                      }}
                      align="center"
                      onClick={() => handleHeaderClick("miners")}
                    >
                      Miners{" "}
                      {sortConfig.field === "miners" &&
                        (sortConfig.direction === "asc" ? (
                          <ArrowUpwardIcon
                            fontSize="small"
                            sx={{ verticalAlign: "middle", ml: 0.5 }}
                          />
                        ) : (
                          <ArrowDownwardIcon
                            fontSize="small"
                            sx={{ verticalAlign: "middle", ml: 0.5 }}
                          />
                        ))}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: "bold",
                        cursor: "pointer",
                        userSelect: "none",
                        "&:hover": { backgroundColor: "action.selected" },
                        whiteSpace: "nowrap",
                      }}
                      align="center"
                      onClick={() => handleHeaderClick("status")}
                    >
                      Status{" "}
                      {sortConfig.field === "status" &&
                        (sortConfig.direction === "asc" ? (
                          <ArrowUpwardIcon
                            fontSize="small"
                            sx={{ verticalAlign: "middle", ml: 0.5 }}
                          />
                        ) : (
                          <ArrowDownwardIcon
                            fontSize="small"
                            sx={{ verticalAlign: "middle", ml: 0.5 }}
                          />
                        ))}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: "bold",
                        cursor: "pointer",
                        userSelect: "none",
                        "&:hover": { backgroundColor: "action.selected" },
                        whiteSpace: "nowrap",
                      }}
                      onClick={() => handleHeaderClick("joinDate")}
                    >
                      Join Date{" "}
                      {sortConfig.field === "joinDate" &&
                        (sortConfig.direction === "asc" ? (
                          <ArrowUpwardIcon
                            fontSize="small"
                            sx={{ verticalAlign: "middle", ml: 0.5 }}
                          />
                        ) : (
                          <ArrowDownwardIcon
                            fontSize="small"
                            sx={{ verticalAlign: "middle", ml: 0.5 }}
                          />
                        ))}
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: "bold" }}>
                      Actions
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    {(Object.keys(filters) as Array<keyof FilterColumns>).map(
                      (column) => (
                        <TableCell key={column}>
                          <TextField
                            // placeholder={column}
                            size="small"
                            value={filters[column]}
                            onChange={(e) =>
                              handleFilterChange(column, e.target.value)
                            }
                          />
                        </TableCell>
                      ),
                    )}
                    {/*<TableCell>*/}
                    {/*    <TextField*/}
                    {/*        // placeholder="Search name"*/}
                    {/*        size="small"*/}
                    {/*        value={filters.name}*/}
                    {/*        onChange={e => handleFilterChange("name", e.target.value)}*/}
                    {/*    />*/}
                    {/*</TableCell>*/}

                    {/*<TableCell>*/}
                    {/*    <TextField*/}
                    {/*        // placeholder="Search email"*/}
                    {/*        size="small"*/}
                    {/*        value={filters.email}*/}
                    {/*        onChange={e => handleFilterChange("email", e.target.value)}*/}
                    {/*    />*/}
                    {/*</TableCell>*/}

                    {/*<TableCell>*/}
                    {/*    <TextField*/}
                    {/*        // placeholder="Search role"*/}
                    {/*        size="small"*/}
                    {/*        value={filters.role}*/}
                    {/*        onChange={e => handleFilterChange("role", e.target.value)}*/}
                    {/*    />*/}
                    {/*</TableCell>*/}
                    {/*<TableCell>*/}
                    {/*    <TextField*/}
                    {/*        // placeholder="Search Luxor Subaccount"*/}
                    {/*        size="small"*/}
                    {/*        value={filters.luxorSubaccountName}*/}
                    {/*        onChange={e => handleFilterChange("luxorSubaccountName", e.target.value)}*/}
                    {/*    />*/}
                    {/*</TableCell>*/}
                    {/*<TableCell>*/}
                    {/*    <TextField*/}
                    {/*        // placeholder="Search role"*/}
                    {/*        size="small"*/}
                    {/*        value={filters.miners}*/}
                    {/*        onChange={e => handleFilterChange("miners", e.target.value)}*/}
                    {/*    />*/}
                    {/*</TableCell>*/}
                    {/*<TableCell>*/}
                    {/*    <TextField*/}
                    {/*        // placeholder="Search role"*/}
                    {/*        size="small"*/}
                    {/*        value={filters.status}*/}
                    {/*        onChange={e => handleFilterChange("status", e.target.value)}*/}
                    {/*    />*/}
                    {/*</TableCell>*/}
                    {/*<TableCell>*/}
                    {/*    <TextField*/}
                    {/*        // placeholder="Search role"*/}
                    {/*        size="small"*/}
                    {/*        value={filters.joinDate}*/}
                    {/*        onChange={e => handleFilterChange("joinDate", e.target.value)}*/}
                    {/*    />*/}
                    {/*</TableCell>*/}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedUsers.map((customer) => (
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
                              color: "primary.main",
                              fontWeight: 500,
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
                        {customer.luxorSubaccountName ?? "Not Set"}
                      </TableCell>
                      <TableCell align="center">{customer.miners}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={customer.status}
                          color={
                            customer.status === "active" ? "success" : "default"
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{customer.joinDate}</TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={(e) => handleMenuOpen(e, customer)}
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Paper>

      {/* Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleEditCustomer}>Edit Customer</MenuItem>
        <MenuItem onClick={handleChangePassword}>Change Password</MenuItem>
        <MenuItem onClick={handleAddPayment}>Add Payment</MenuItem>
        <MenuItem onClick={handleCreateAdjustment}>Create Adjustment</MenuItem>
        <MenuItem onClick={handleDeleteCustomer} sx={{ color: "error.main" }}>
          Delete Customer
        </MenuItem>
      </Menu>

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
