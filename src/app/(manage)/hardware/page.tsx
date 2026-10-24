"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  CircularProgress,
  Menu,
  MenuItem,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Warning as WarningIcon,
  MoreVert as MoreVertIcon,
} from "@mui/icons-material";
import { useUser } from "@/lib/hooks/useUser";
import AdminValueCard from "@/components/admin/AdminValueCard";
import { useDaylight } from "@/lib/daylight";
import {
  DaylightAdminPage,
  DaylightPageHeader,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

interface ProcurementHistoryEntry {
  id: string;
  quantity: number;
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface Hardware {
  id: string;
  model: string;
  powerUsage: number;
  hashRate: number | string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  procurementHistory?: ProcurementHistoryEntry[];
  isDeleted: boolean;
  _count?: {
    miners: number;
  };
}

interface FormData {
  model: string;
  powerUsage: string | number;
  hashRate: string | number;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export default function HardwarePage() {
  const { d, fonts } = useDaylight();
  const ds = useDaylightAdminSx();
  const { user } = useUser();
  const [hardware, setHardware] = useState<Hardware[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedHardwareId, setSelectedHardwareId] = useState<string | null>(
    null,
  );
  const [procurementOpen, setProcurementOpen] = useState(false);
  const [procurementQuantity, setProcurementQuantity] = useState<string>("1");
  const [procurementError, setProcurementError] = useState<string | null>(null);
  const [procuringHardwareId, setProcuringHardwareId] = useState<string | null>(
    null,
  );
  const [procuring, setProcuring] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHardwareForHistory, setSelectedHardwareForHistory] =
    useState<Hardware | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    model: "",
    powerUsage: "",
    hashRate: "",
  });

  /**
   * Fetch hardware list
   */
  const fetchHardware = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = new URL("/api/hardware", window.location.origin);
      if (showDeleted) {
        url.searchParams.append("isDeleted", "true");
      }
      const response = await fetch(url.toString());
      const data: ApiResponse<Hardware[]> = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch hardware");
      }

      setHardware(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [showDeleted]);

  useEffect(() => {
    fetchHardware();
  }, [fetchHardware]);

  /**
   * Handle form input change
   */
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /**
   * Handle menu open
   */
  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    hardwareId: string,
  ) => {
    setAnchorEl(event.currentTarget);
    setSelectedHardwareId(hardwareId);
  };

  /**
   * Handle menu close
   */
  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedHardwareId(null);
  };

  /**
   * Handle open procurement modal
   */
  const handleOpenProcurement = (hardwareId: string) => {
    handleMenuClose();
    setProcuringHardwareId(hardwareId);
    setProcurementQuantity("1");
    setProcurementError(null);
    setProcurementOpen(true);
  };

  /**
   * Handle close procurement modal
   */
  const handleCloseProcurement = () => {
    if (!procuring) {
      setProcurementOpen(false);
      setProcuringHardwareId(null);
      setProcurementQuantity("1");
      setProcurementError(null);
    }
  };

  const handleProcurementDelete = () => {
    const qty = parseInt(procurementQuantity);

    if (user?.role !== "SUPER_ADMIN" && (isNaN(qty) || qty < 1)) {
      setProcurementError("Delete is unauthorized for this user");
      return;
    }

    handleProcureSubmit(-qty); // Negative quantity for deletion
  };
  const handleProcurementAdd = () => {
    const qty = parseInt(procurementQuantity);
    if (isNaN(qty) || qty < 1) {
      setProcurementError("Quantity must be at least 1");
      return;
    }

    handleProcureSubmit(qty);
  };

  /**
   * Handle procure hardware submit
   */
  const handleProcureSubmit = async (qty: number) => {
    setProcurementError(null);

    if (!procuringHardwareId) {
      setProcurementError("Hardware ID is missing");
      return;
    }

    setProcuring(true);
    try {
      const response = await fetch("/api/hardware/procure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hardwareId: procuringHardwareId,
          quantity: qty,
        }),
      });

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to procure hardware");
      }

      handleCloseProcurement();
      await fetchHardware();
    } catch (err) {
      setProcurementError(
        err instanceof Error ? err.message : "An error occurred",
      );
    } finally {
      setProcuring(false);
    }
  };

  /**
   * Handle open procurement history modal
   */
  const handleOpenHistory = (hw: Hardware) => {
    handleMenuClose();
    setSelectedHardwareForHistory(hw);
    setHistoryOpen(true);
  };

  /**
   * Handle close procurement history modal
   */
  const handleCloseHistory = () => {
    setHistoryOpen(false);
    setSelectedHardwareForHistory(null);
  };

  /**
   * Format date and time to readable string
   */
  const formatDateTime = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /**
   * Validate form data
   */
  const validateForm = (): boolean => {
    setFormError(null);

    if (!formData.model.trim()) {
      setFormError("Model name is required");
      return false;
    }

    const power = parseFloat(String(formData.powerUsage));
    if (isNaN(power) || power <= 0) {
      setFormError("Power usage must be a positive number (in kW)");
      return false;
    }

    const hash = parseFloat(String(formData.hashRate));
    if (isNaN(hash) || hash <= 0) {
      setFormError("Hash rate must be a positive number (in TH/s)");
      return false;
    }

    return true;
  };

  /**
   * Handle create new hardware
   */
  const handleCreateNew = () => {
    setEditingId(null);
    setFormData({
      model: "",
      powerUsage: "",
      hashRate: "",
    });
    setFormError(null);
    setOpenForm(true);
  };

  /**
   * Handle edit hardware
   */
  const handleEdit = (hw: Hardware) => {
    handleMenuClose();
    setEditingId(hw.id);
    setFormData({
      model: hw.model,
      powerUsage: hw.powerUsage,
      hashRate: hw.hashRate,
    });
    setFormError(null);
    setOpenForm(true);
  };

  /**
   * Handle submit (create or update)
   */
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const url = editingId ? `/api/hardware/${editingId}` : "/api/hardware";
      const method = editingId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: formData.model.trim(),
          powerUsage: parseFloat(String(formData.powerUsage)),
          hashRate: parseFloat(String(formData.hashRate)),
          ...(editingId ? {} : { quantity: 1 }), // Set quantity to 0 only for new hardware
        }),
      });

      const data: ApiResponse<Hardware> = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || `Failed to ${editingId ? "update" : "create"} hardware`,
        );
      }

      setOpenForm(false);
      setFormData({
        model: "",
        powerUsage: "",
        hashRate: "",
      });
      await fetchHardware();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle delete confirmation
   */
  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/hardware/${deleteConfirm}`, {
        method: "DELETE",
      });

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete hardware");
      }

      setDeleteConfirm(null);
      await fetchHardware();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Format date to readable string
   */
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const [averagePowerUsage, averageHashRate] = useMemo(() => {
    const baseValues = ["0.00 kW", "0.00 TH/s"];
    if (hardware.length === 0) return baseValues;

    // Prefer weighting by currently deployed miners per model, since that
    // reflects the fleet actually drawing power / hashing right now.
    const deployedCount = hardware.reduce(
      (sum, hw) => sum + (hw._count?.miners ?? 0),
      0,
    );

    if (deployedCount > 0) {
      const avgPowerUsage = (
        hardware.reduce(
          (sum, hw) => sum + hw.powerUsage * (hw._count?.miners ?? 0),
          0,
        ) / deployedCount
      ).toFixed(2);
      const avgHashRate = (
        hardware.reduce(
          (sum, hw) =>
            sum + parseFloat(String(hw.hashRate)) * (hw._count?.miners ?? 0),
          0,
        ) / deployedCount
      ).toFixed(2);

      return [`${avgPowerUsage} kW`, `${avgHashRate} TH/s`];
    }

    // No miners deployed yet - fall back to a plain average across models
    // so the cards still reflect the catalog instead of showing 0.
    const avgPowerUsage = (
      hardware.reduce((sum, hw) => sum + hw.powerUsage, 0) / hardware.length
    ).toFixed(2);
    const avgHashRate = (
      hardware.reduce((sum, hw) => sum + parseFloat(String(hw.hashRate)), 0) /
      hardware.length
    ).toFixed(2);

    return [`${avgPowerUsage} kW`, `${avgHashRate} TH/s`];
  }, [hardware]);

  const menuPaperSx = {
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
      color: d.text,
      "&:hover": { bgcolor: d.hover },
    },
    "& .MuiTypography-root": { fontFamily: fonts.body, fontSize: 13 },
  } as const;

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Hardware Management"
        description="Manage mining hardware models and their specifications."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateNew}
            disabled={loading}
            sx={ds.primaryBtnSx}
          >
            Add Hardware
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3, ...ds.alertSx("error") }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
          gap: { xs: "12px", sm: "16px", md: "20px" },
          mb: { xs: "20px", md: "24px" },
        }}
      >
        <AdminValueCard
          daylight
          title="Total Hardware Models"
          value={hardware.length}
        />
        <AdminValueCard
          daylight
          title="Average Power Usage"
          value={averagePowerUsage}
        />
        <AdminValueCard
          daylight
          title="Average Hash Rate"
          value={averageHashRate}
        />
      </Box>

      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
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
      <TableContainer component={Paper} elevation={0} sx={ds.tableCardSx}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Model</TableCell>
              <TableCell align="right">Power Usage (kW)</TableCell>
              <TableCell align="right">Hash Rate (TH/s)</TableCell>
              <TableCell align="center">Available Quantity</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ "&&&": { py: 4 } }}>
                  <CircularProgress sx={{ color: d.action }} />
                </TableCell>
              </TableRow>
            ) : hardware.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  align="center"
                  sx={{ "&&&": { py: 5, color: d.muted } }}
                >
                  No hardware found. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              hardware.map((hw) => (
                <TableRow key={hw.id}>
                  <TableCell sx={{ "&&&": { fontWeight: 650 } }}>
                    {hw.model}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ "&&&": { fontVariantNumeric: "tabular-nums" } }}
                  >
                    {parseFloat(String(hw.powerUsage)).toFixed(3)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ "&&&": { fontVariantNumeric: "tabular-nums" } }}
                  >
                    {parseFloat(String(hw.hashRate)).toFixed(2)}
                  </TableCell>
                  <TableCell align="center">
                    <DaylightStatusPill
                      label={`${hw.quantity} unit${hw.quantity !== 1 ? "s" : ""}`}
                      tone={hw.quantity > 0 ? "success" : "neutral"}
                    />
                  </TableCell>
                  <TableCell sx={{ "&&&": { whiteSpace: "nowrap" } }}>
                    {formatDate(hw.createdAt)}
                  </TableCell>
                  <TableCell align="center" sx={{ "&&&": { py: "8px" } }}>
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, hw.id)}
                      disabled={loading}
                      title="Actions"
                      aria-label={`Actions for ${hw.model}`}
                      sx={{
                        color: d.muted,
                        borderRadius: "8px",
                        "&:hover": { bgcolor: d.hover, color: d.action },
                      }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                    <Menu
                      anchorEl={anchorEl}
                      open={anchorEl !== null && selectedHardwareId === hw.id}
                      onClose={handleMenuClose}
                      slotProps={{ paper: { sx: menuPaperSx } }}
                    >
                      <MenuItem onClick={() => handleEdit(hw)}>
                        <EditIcon fontSize="small" sx={{ mr: 1 }} />
                        Edit
                      </MenuItem>
                      <MenuItem onClick={() => handleOpenProcurement(hw.id)}>
                        <Typography fontSize="small">
                          📦 Procure Hardware
                        </Typography>
                      </MenuItem>
                      <MenuItem onClick={() => handleOpenHistory(hw)}>
                        <Typography fontSize="small">
                          📋 Show Procurement History
                        </Typography>
                      </MenuItem>
                      <MenuItem
                        disabled={hw.isDeleted}
                        onClick={() => {
                          handleMenuClose();
                          setDeleteConfirm(hw.id);
                        }}
                        sx={{ "&&": { color: d.danger } }}
                      >
                        <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
                        Delete
                      </MenuItem>
                    </Menu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit Form Dialog */}
      <Dialog
        open={openForm}
        onClose={() => !saving && setOpenForm(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingId ? "Edit Hardware" : "Create New Hardware"}
        </DialogTitle>

        <DialogContent sx={{ pt: 2 }}>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}

          <TextField
            fullWidth
            label="Model Name"
            name="model"
            value={formData.model}
            onChange={handleFormChange}
            placeholder="e.g., Bitmain S21 Pro"
            margin="normal"
            disabled={saving}
          />

          <TextField
            fullWidth
            label="Power Usage (kW)"
            name="powerUsage"
            type="number"
            value={formData.powerUsage}
            onChange={handleFormChange}
            placeholder="e.g., 3.25"
            margin="normal"
            inputProps={{ min: "0.1", step: "0.1" }}
            disabled={saving}
          />

          <TextField
            fullWidth
            label="Hash Rate (TH/s)"
            name="hashRate"
            type="number"
            value={formData.hashRate}
            onChange={handleFormChange}
            placeholder="e.g., 234.5"
            margin="normal"
            inputProps={{ min: "0.1", step: "0.1" }}
            disabled={saving}
          />
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => !saving && setOpenForm(false)}
            disabled={saving}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={saving}
            startIcon={saving && <CircularProgress size={20} />}
          >
            {saving ? "Saving..." : editingId ? "Update" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirm !== null}
        onClose={() => !deleting && setDeleteConfirm(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningIcon color="error" />
          Delete Hardware
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography>
            Are you sure you want to delete this hardware? This action cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => !deleting && setDeleteConfirm(null)}
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
            startIcon={deleting && <CircularProgress size={20} />}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Procurement Modal */}
      <Dialog
        open={procurementOpen}
        onClose={handleCloseProcurement}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Procure Hardware</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {procurementError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {procurementError}
            </Alert>
          )}

          <TextField
            fullWidth
            label="Quantity"
            type="number"
            value={procurementQuantity}
            onChange={(e) => setProcurementQuantity(e.target.value)}
            inputProps={{ min: "1", step: "1" }}
            disabled={procuring}
            helperText="Number of units to procure"
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseProcurement}
            disabled={procuring}
            color="inherit"
          >
            Cancel
          </Button>
          {user && user.role === "SUPER_ADMIN" && (
            <Button
              onClick={handleProcurementDelete}
              variant="contained"
              color="error"
              disabled={procuring}
              startIcon={procuring && <CircularProgress size={20} />}
            >
              {procuring ? "Deleting..." : "Delete"}
            </Button>
          )}
          <Button
            onClick={handleProcurementAdd}
            variant="contained"
            disabled={procuring}
            startIcon={procuring && <CircularProgress size={20} />}
          >
            {procuring ? "Adding..." : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Procurement History Modal */}
      <Dialog
        open={historyOpen}
        onClose={handleCloseHistory}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Procurement History - {selectedHardwareForHistory?.model}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {!selectedHardwareForHistory?.procurementHistory ||
          selectedHardwareForHistory.procurementHistory.length === 0 ? (
            <Typography
              color="text.secondary"
              sx={{ textAlign: "center", py: 4 }}
            >
              No procurement history available for this hardware.
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {selectedHardwareForHistory.procurementHistory.map((entry) => (
                <Box
                  key={entry.id}
                  sx={{
                    p: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: "600" }}>
                      Quantity: {entry.quantity} unit
                      {entry.quantity !== 1 ? "s" : ""}
                      &nbsp;{entry.quantity < 0 && "(removed)"}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 0.5 }}
                    >
                      By: {entry.createdBy.name || entry.createdBy.email}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateTime(entry.createdAt)}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseHistory} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </DaylightAdminPage>
  );
}
