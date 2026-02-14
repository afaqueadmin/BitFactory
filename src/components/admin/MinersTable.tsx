/**
 * Miners Table Component
 *
 * Displays a list of miners with CRUD action buttons.
 * Integrates with MUI DataGrid for efficient data rendering.
 * Supports sorting by all miner fields with visual indicators.
 */

"use client";

import React, { Dispatch, SetStateAction, useMemo } from "react";
import {
  Box,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  FormControl,
  Select,
  MenuItem,
  SelectChangeEvent,
  Menu,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  MoreVert as MoreVertIcon,
} from "@mui/icons-material";
import {
  sortMiners,
  toggleSortDirection,
  getSortFieldLabel,
  getAllSortFields,
  type SortConfig,
  type MinerSortField,
} from "@/lib/utils/sortMiners";

/**
 * User object from API
 */
interface User {
  id: string;
  name: string | null;
  email: string;
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
  isDeleted: boolean;
  rate_per_kwh?: number;
  user?: User;
  space?: Space;
  hardware?: Hardware;
  rateHistory?: Array<{
    rate_per_kwh: number;
    createdAt: string;
  }>;
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

interface MinersTableProps {
  miners: Miner[];
  onEdit: (miner: Miner) => void;
  onDelete: (minerId: string) => void;
  isLoading?: boolean;
  error?: string | null;
  showDeleted: boolean;
  setShowDeleted: Dispatch<SetStateAction<boolean>>;
}

export default function MinersTable({
  miners,
  onEdit,
  onDelete,
  isLoading = false,
  error = null,
  showDeleted,
  setShowDeleted,
}: MinersTableProps) {
  const [deleteConfirm, setDeleteConfirm] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [sortConfig, setSortConfig] = React.useState<SortConfig>({
    field: "name",
    direction: "asc",
  });
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [selectedMinerId, setSelectedMinerId] = React.useState<string | null>(
    null,
  );
  const [rateHistoryOpen, setRateHistoryOpen] = React.useState(false);

  /**
   * Handle delete confirmation
   */
  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;

    setDeleting(true);
    try {
      await onDelete(deleteConfirm);
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Handle sort field change
   */
  const handleSortFieldChange = (event: SelectChangeEvent<MinerSortField>) => {
    const newField = event.target.value as MinerSortField;
    setSortConfig({ field: newField, direction: "asc" });
  };

  /**
   * Handle sort direction toggle
   */
  const handleSortDirectionToggle = () => {
    setSortConfig({
      ...sortConfig,
      direction: toggleSortDirection(sortConfig.direction),
    });
  };

  /**
   * Handle menu open
   */
  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    minerId: string,
  ) => {
    setAnchorEl(event.currentTarget);
    setSelectedMinerId(minerId);
  };

  /**
   * Handle menu close
   */
  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedMinerId(null);
  };

  /**
   * Handle edit miner
   */
  const handleEdit = (miner: Miner) => {
    handleMenuClose();
    onEdit(miner);
  };

  /**
   * Handle delete miner
   */
  const handleDelete = (minerId: string) => {
    handleMenuClose();
    setDeleteConfirm(minerId);
  };

  /**
   * Handle view rate history
   */
  const handleViewRateHistory = (minerId: string) => {
    handleMenuClose();
    setSelectedMinerId(minerId);
    setRateHistoryOpen(true);
  };

  /**
   * Handle header cell click to sort
   */
  const handleHeaderClick = (field: MinerSortField) => {
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

  /**
   * Get status color based on value
   */
  const getStatusColor = (
    status: "AUTO" | "DEPLOYMENT_IN_PROGRESS",
  ): "success" | "default" => {
    return status === "AUTO" ? "success" : "default";
  };

  /**
   * Memoized sorted rows
   */
  const memoizedRows = useMemo(
    () => sortMiners(miners, sortConfig),
    [miners, sortConfig],
  );

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Sort Controls */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontWeight: "600", whiteSpace: "nowrap" }}
          >
            Sort by:
          </Typography>
          <FormControl sx={{ minWidth: 180 }}>
            <Select
              value={sortConfig.field}
              onChange={handleSortFieldChange}
              size="small"
            >
              {getAllSortFields().map((field) => (
                <MenuItem key={field} value={field}>
                  {getSortFieldLabel(field)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            size="small"
            onClick={handleSortDirectionToggle}
            startIcon={
              sortConfig.direction === "asc" ? (
                <ArrowUpwardIcon fontSize="small" />
              ) : (
                <ArrowDownwardIcon fontSize="small" />
              )
            }
            variant="outlined"
            sx={{ textTransform: "capitalize", whiteSpace: "nowrap" }}
          >
            {sortConfig.direction === "asc" ? "Asc" : "Desc"}
          </Button>
        </Box>
        <FormControlLabel
          control={
            <Checkbox
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
          }
          label="Show Deleted"
        />
      </Box>

      <TableContainer
        component={Paper}
        sx={{
          backgroundColor: "background.paper",
          overflowX: "auto",
          overflowY: "visible",
          width: "100%",
          maxWidth: "100%",
        }}
      >
        <Table
          sx={{
            minWidth: "900px",
            tableLayout: "auto",
            "& th": {
              whiteSpace: "nowrap",
              padding: "12px 8px",
              fontSize: "0.875rem",
            },
            "& td": {
              padding: "12px 8px",
              fontSize: "0.875rem",
            },
          }}
          aria-label="miners table"
        >
          <TableHead sx={{ backgroundColor: "action.hover" }}>
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
                Name{" "}
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
                onClick={() => handleHeaderClick("model")}
              >
                Model{" "}
                {sortConfig.field === "model" &&
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
                onClick={() => handleHeaderClick("user")}
              >
                User{" "}
                {sortConfig.field === "user" &&
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
                onClick={() => handleHeaderClick("subaccount")}
              >
                Subaccount{" "}
                {sortConfig.field === "subaccount" &&
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
              <TableCell sx={{ fontWeight: "bold" }}>Space</TableCell>
              <TableCell
                sx={{
                  fontWeight: "bold",
                  cursor: "pointer",
                  userSelect: "none",
                  "&:hover": { backgroundColor: "action.selected" },
                  whiteSpace: "nowrap",
                }}
                align="right"
                onClick={() => handleHeaderClick("powerUsage")}
              >
                Power (kW){" "}
                {sortConfig.field === "powerUsage" &&
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
                align="right"
                onClick={() => handleHeaderClick("hashRate")}
              >
                Hash Rate (TH/s){" "}
                {sortConfig.field === "hashRate" &&
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
                align="right"
                onClick={() => handleHeaderClick("ratePerKwh")}
              >
                Rate (USD){" "}
                {sortConfig.field === "ratePerKwh" &&
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
                onClick={() => handleHeaderClick("createdAt")}
              >
                Created{" "}
                {sortConfig.field === "createdAt" &&
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
              <TableCell sx={{ fontWeight: "bold" }} align="center">
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : memoizedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No miners found. Create one to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              memoizedRows.map((miner) => (
                <TableRow
                  key={miner.id}
                  hover
                  sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                >
                  <TableCell sx={{ fontWeight: "500" }}>{miner.name}</TableCell>
                  <TableCell>{miner.hardware?.model || "—"}</TableCell>
                  <TableCell>
                    {miner.user?.name || miner.user?.email || "—"}
                  </TableCell>
                  <TableCell>
                    {miner.user?.luxorSubaccountName || "—"}
                  </TableCell>
                  <TableCell>
                    {miner.space ? (
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: "500" }}>
                          {miner.space.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {miner.space.location}
                        </Typography>
                      </Box>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {miner.hardware?.powerUsage || 0} kW
                  </TableCell>
                  <TableCell align="right">
                    {parseFloat(String(miner.hardware?.hashRate || 0)).toFixed(
                      2,
                    )}{" "}
                    TH/s
                  </TableCell>
                  <TableCell align="right">
                    {miner.rate_per_kwh ? (
                      `$${Number(miner.rate_per_kwh).toFixed(4)}`
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        —
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={miner.status}
                      color={getStatusColor(miner.status)}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{formatDate(miner.createdAt)}</TableCell>
                  <TableCell align="center">
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, miner.id)}
                      disabled={isLoading}
                      title="Actions"
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                    <Menu
                      anchorEl={anchorEl}
                      open={anchorEl !== null && selectedMinerId === miner.id}
                      onClose={handleMenuClose}
                    >
                      <MenuItem onClick={() => handleEdit(miner)}>
                        <EditIcon fontSize="small" sx={{ mr: 1 }} />
                        Edit
                      </MenuItem>
                      <MenuItem onClick={() => handleViewRateHistory(miner.id)}>
                        <Typography fontSize="small">
                          📈 See Miner History
                        </Typography>
                      </MenuItem>
                      <MenuItem
                        disabled={miner.isDeleted}
                        onClick={() => handleDelete(miner.id)}
                        sx={{ color: "error.main" }}
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

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningIcon color="error" />
          Delete Miner
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography>
            Are you sure you want to delete this miner? This action cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
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
            startIcon={deleting && <CircularProgress size={20} />}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Activity History Modal */}
      <Dialog
        open={rateHistoryOpen}
        onClose={() => setRateHistoryOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Miner Activity History</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(() => {
              const miner = memoizedRows.find((m) => m.id === selectedMinerId);
              const rateHistory = miner?.rateHistory || [];
              const ownershipHistory = miner?.ownershipHistory || [];

              // Combine both histories
              const combinedHistory = [
                ...rateHistory.map((h) => ({
                  type: "rate",
                  createdAt: new Date(h.createdAt),
                  data: h,
                })),
                ...ownershipHistory.map((h) => ({
                  type: "ownership",
                  createdAt: new Date(h.createdAt),
                  data: h,
                })),
              ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

              return combinedHistory && combinedHistory.length > 0 ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {combinedHistory.map((activity, index: number) => (
                    <Box
                      key={index}
                      sx={{
                        p: 1.5,
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.5,
                      }}
                    >
                      {activity.type === "rate" ? (
                        <>
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: "600" }}
                            >
                              Rate Update: $
                              {Number(
                                (activity.data as { rate_per_kwh: number })
                                  .rate_per_kwh,
                              ).toFixed(3)}
                              /kWh
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {activity.createdAt.toLocaleDateString("en-CA")}{" "}
                              {activity.createdAt.toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              })}
                            </Typography>
                          </Box>
                        </>
                      ) : (
                        <>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: "600", color: "info.main" }}
                          >
                            Ownership Transfer
                          </Typography>
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                            }}
                          >
                            <Box sx={{ display: "flex", gap: 2, flex: 1 }}>
                              <Box sx={{ flex: 1, minWidth: "150px" }}>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  New Owner
                                </Typography>
                                <Typography variant="body2">
                                  {(
                                    activity.data as {
                                      owner: {
                                        name: string | null;
                                        email: string;
                                      };
                                    }
                                  ).owner?.name || "—"}
                                </Typography>
                                <Typography variant="body2">
                                  (
                                  {(
                                    activity.data as {
                                      owner: {
                                        name: string | null;
                                        email: string;
                                      };
                                    }
                                  ).owner?.email || "—"}
                                  )
                                </Typography>
                              </Box>
                              <Box sx={{ flex: 1, minWidth: "150px" }}>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Changed By
                                </Typography>
                                <Typography variant="body2">
                                  {(
                                    activity.data as {
                                      createdBy: {
                                        name: string | null;
                                        email: string;
                                      };
                                    }
                                  ).createdBy?.name ||
                                    (
                                      activity.data as {
                                        createdBy: {
                                          name: string | null;
                                          email: string;
                                        };
                                      }
                                    ).createdBy?.email ||
                                    "—"}
                                </Typography>
                                <Typography variant="body2">
                                  (
                                  {(
                                    activity.data as {
                                      createdBy: {
                                        name: string | null;
                                        email: string;
                                      };
                                    }
                                  ).createdBy?.email || "—"}
                                  )
                                </Typography>
                              </Box>
                            </Box>
                            <Box sx={{ minWidth: "150px", textAlign: "right" }}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {activity.createdAt.toLocaleDateString("en-CA")}{" "}
                                {activity.createdAt.toLocaleTimeString(
                                  "en-US",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: false,
                                  },
                                )}
                              </Typography>
                            </Box>
                          </Box>
                        </>
                      )}
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ textAlign: "center", py: 2 }}
                >
                  No activity history available for this miner.
                </Typography>
              );
            })()}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRateHistoryOpen(false)} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
