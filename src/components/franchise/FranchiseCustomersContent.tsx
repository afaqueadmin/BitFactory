"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  Box,
  Typography,
  Button,
  Alert,
  Snackbar,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  CircularProgress,
  Chip,
  Menu,
  MenuItem,
  Checkbox,
  FormControlLabel,
  TextField,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  ArrowUpward,
  ArrowDownward,
} from "@mui/icons-material";
import AdminValueCard from "@/components/admin/AdminValueCard";
import FranchiseCreateCustomerRequestModal from "./FranchiseCreateCustomerRequestModal";
import FranchiseEditCustomerModal from "./FranchiseEditCustomerModal";
import FranchiseChangePasswordModal from "./FranchiseChangePasswordModal";
import FranchiseAddPaymentModal from "./FranchiseAddPaymentModal";
import {
  sortCustomers,
  toggleSortDirection,
  getAllSortFields,
  getSortFieldLabel,
  type SortConfig,
  type CustomerSortField,
} from "@/lib/utils/sortCustomers";

interface Customer {
  id: string;
  email: string;
  name: string;
  role: string;
  city: string;
  country: string;
  phoneNumber: string;
  companyName: string;
  streetAddress: string;
  luxorSubaccountName: string;
  pools: string;
  twoFactorEnabled: boolean;
  joinDate: string;
  miners: number;
  status: "active" | "inactive";
  isDeleted: boolean;
  franchiseeId: string | null;
  segment: string | null;
  balance: string;
}

interface CustomerRequest {
  id: string;
  name: string;
  email: string;
  luxorSubaccountName: string;
  initialDeposit: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export default function FranchiseCustomersContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"customers" | "requests">("customers");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [passwordCustomerId, setPasswordCustomerId] = useState<string | null>(
    null,
  );
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [notification, setNotification] = useState("");

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: "name",
    direction: "asc",
  });
  const [filters, setFilters] = useState<Record<string, string>>({});

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = new URL("/api/franchise/customers", window.location.origin);
      if (showDeleted) url.searchParams.set("isDeleted", "true");
      const response = await fetch(url.toString());
      const data = await response.json();
      if (!data.success)
        throw new Error(data.error || "Failed to fetch customers");
      setCustomers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [showDeleted]);

  const fetchRequests = useCallback(async () => {
    try {
      setRequestsLoading(true);
      const response = await fetch("/api/franchise/customers/requests");
      const data = await response.json();
      if (data.success) setRequests(data.data || []);
    } catch (err) {
      console.error("Failed to fetch requests:", err);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    const balanceFilter = searchParams.get("balanceFilter");
    if (balanceFilter) {
      setFilters((prev) => ({ ...prev, balance: balanceFilter.trim() }));
    }
  }, [searchParams]);

  const handleMenuOpen = (
    e: React.MouseEvent<HTMLElement>,
    customer: Customer,
  ) => {
    setAnchorEl(e.currentTarget);
    setSelectedCustomer(customer);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedCustomer(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(
        `/api/franchise/customers/${deleteConfirm.id}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!data.success)
        throw new Error(data.error || "Failed to delete customer");
      setNotification("Customer deleted successfully");
      setDeleteConfirm(null);
      fetchCustomers();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete customer",
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleHeaderClick = (field: CustomerSortField) => {
    setSortConfig((prev) =>
      prev.field === field
        ? { field, direction: toggleSortDirection(prev.direction) }
        : { field, direction: "asc" },
    );
  };

  const filteredSortedCustomers = useMemo(() => {
    let result = [...customers];
    Object.entries(filters).forEach(([field, value]) => {
      if (!value) return;
      if (field === "balance") {
        const wantsPositive = value.includes(">");
        result = result.filter((c) =>
          wantsPositive ? Number(c.balance) > 0 : Number(c.balance) < 0,
        );
        return;
      }
      result = result.filter((c) =>
        String((c as unknown as Record<string, unknown>)[field] ?? "")
          .toLowerCase()
          .includes(value.toLowerCase()),
      );
    });
    return sortCustomers(result, sortConfig);
  }, [customers, filters, sortConfig]);

  const stats = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c) => c.status === "active").length;
    const totalMiners = customers.reduce((sum, c) => sum + c.miners, 0);
    return { total, active, totalMiners };
  }, [customers]);

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold" sx={{ mb: 0.5 }}>
          Customers
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage your onboarded customers
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 2,
          mb: 3,
        }}
      >
        <AdminValueCard title="Total Customers" value={stats.total} />
        <AdminValueCard title="Active Customers" value={stats.active} />
        <AdminValueCard title="Total Miners" value={stats.totalMiners} />
      </Box>

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Customers" value="customers" />
          <Tab
            label={
              pendingCount > 0 ? `My Requests (${pendingCount})` : "My Requests"
            }
            value="requests"
          />
        </Tabs>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
        >
          Request New Customer
        </Button>
      </Box>

      {tab === "customers" && (
        <>
          <FormControlLabel
            control={
              <Checkbox
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
              />
            }
            label="Show Deleted"
          />

          <TableContainer component={Paper}>
            <Table>
              <TableHead sx={{ backgroundColor: "action.hover" }}>
                <TableRow>
                  {getAllSortFields().map((field) => (
                    <TableCell
                      key={field}
                      sx={{ fontWeight: "bold", cursor: "pointer" }}
                      onClick={() => handleHeaderClick(field)}
                    >
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                      >
                        {getSortFieldLabel(field)}
                        {sortConfig.field === field &&
                          (sortConfig.direction === "asc" ? (
                            <ArrowUpward fontSize="inherit" />
                          ) : (
                            <ArrowDownward fontSize="inherit" />
                          ))}
                      </Box>
                    </TableCell>
                  ))}
                  <TableCell sx={{ fontWeight: "bold" }} align="center">
                    Actions
                  </TableCell>
                </TableRow>
                <TableRow>
                  {getAllSortFields().map((field) => (
                    <TableCell key={field}>
                      {field === "balance" ? null : (
                        <TextField
                          size="small"
                          variant="standard"
                          placeholder="Filter..."
                          value={filters[field] || ""}
                          onChange={(e) =>
                            setFilters((prev) => ({
                              ...prev,
                              [field]: e.target.value,
                            }))
                          }
                        />
                      )}
                    </TableCell>
                  ))}
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : filteredSortedCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        No customers found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSortedCustomers.map((c) => (
                    <TableRow key={c.id} hover>
                      <TableCell
                        sx={{
                          fontWeight: 500,
                          color: c.isDeleted ? "error.main" : undefined,
                        }}
                      >
                        {c.name}
                      </TableCell>
                      <TableCell>{c.email}</TableCell>
                      <TableCell>{c.role}</TableCell>
                      <TableCell>{c.segment || "-"}</TableCell>
                      <TableCell>{c.pools || "-"}</TableCell>
                      <TableCell>{c.miners}</TableCell>
                      <TableCell>
                        <Chip
                          label={c.status}
                          size="small"
                          color={c.status === "active" ? "success" : "default"}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{c.joinDate}</TableCell>
                      <TableCell>${c.balance}</TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={(e) => handleMenuOpen(e, c)}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {tab === "requests" && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead sx={{ backgroundColor: "action.hover" }}>
              <TableRow>
                <TableCell sx={{ fontWeight: "bold" }}>Name</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Email</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Subaccount</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Submitted</TableCell>
                <TableCell sx={{ fontWeight: "bold" }} align="center">
                  Status
                </TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requestsLoading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No requests submitted yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>{r.luxorSubaccountName}</TableCell>
                    <TableCell>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={r.status}
                        size="small"
                        color={
                          r.status === "APPROVED"
                            ? "success"
                            : r.status === "REJECTED"
                              ? "error"
                              : "warning"
                        }
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {r.status === "REJECTED" && r.rejectionReason
                        ? r.rejectionReason
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem
          onClick={() => {
            setEditingCustomer(selectedCustomer);
            handleMenuClose();
          }}
        >
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            setPasswordCustomerId(selectedCustomer?.id || null);
            handleMenuClose();
          }}
        >
          Change Password
        </MenuItem>
        <MenuItem
          onClick={() => {
            setPaymentCustomer(selectedCustomer);
            handleMenuClose();
          }}
        >
          Add Payment
        </MenuItem>
        <MenuItem
          disabled={selectedCustomer?.isDeleted}
          onClick={() => {
            setDeleteConfirm(selectedCustomer);
            handleMenuClose();
          }}
          sx={{ color: "error.main" }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      <FranchiseCreateCustomerRequestModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={(text) => {
          setNotification(text);
          fetchRequests();
        }}
      />

      <FranchiseEditCustomerModal
        open={Boolean(editingCustomer)}
        onClose={() => setEditingCustomer(null)}
        onSuccess={(text) => {
          setNotification(text);
          fetchCustomers();
        }}
        customerId={editingCustomer?.id || null}
        initialData={editingCustomer}
      />

      <FranchiseChangePasswordModal
        open={Boolean(passwordCustomerId)}
        onClose={() => setPasswordCustomerId(null)}
        onSuccess={(text) => setNotification(text)}
        customerId={passwordCustomerId}
      />

      <FranchiseAddPaymentModal
        open={Boolean(paymentCustomer)}
        onClose={() => setPaymentCustomer(null)}
        onSuccess={(text) => {
          setNotification(text);
          fetchCustomers();
        }}
        customerId={paymentCustomer?.id || null}
        customerName={paymentCustomer?.name}
      />

      <Dialog
        open={Boolean(deleteConfirm)}
        onClose={() => (deleting ? null : setDeleteConfirm(null))}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Customer</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete{" "}
            <strong>{deleteConfirm?.name}</strong>? This action cannot be
            undone.
          </Typography>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => setDeleteConfirm(null)}
            disabled={deleting}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
            disabled={deleting}
          >
            {deleting ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Delete"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(notification)}
        autoHideDuration={5000}
        onClose={() => setNotification("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setNotification("")}
          severity={
            notification.toLowerCase().includes("fail") ? "error" : "success"
          }
          sx={{ width: "100%" }}
        >
          {notification}
        </Alert>
      </Snackbar>
    </Box>
  );
}
