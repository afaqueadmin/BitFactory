/**
 * Miners Table Component
 *
 * Displays a list of miners with CRUD action buttons.
 * Integrates with MUI DataGrid for efficient data rendering.
 * Supports sorting by all miner fields with visual indicators.
 */

"use client";

import React, { useMemo } from "react";
import {
  Box,
  Button,
  IconButton,
  Stack,
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
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
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
  hashRate: number | string;
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
  user?: User;
  space?: Space;
  hardware?: Hardware;
}

interface MinersTableProps {
  miners: Miner[];
  onEdit: (miner: Miner) => void;
  onDelete: (minerId: string) => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function MinersTable({
  miners,
  onEdit,
  onDelete,
  isLoading = false,
  error = null,
}: MinersTableProps) {
  const [deleteConfirm, setDeleteConfirm] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [sortConfig, setSortConfig] = React.useState<SortConfig>({
    field: "name",
    direction: "asc",
  });

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
                    {(miner.hardware?.powerUsage || 0).toFixed(2)} kW
                  </TableCell>
                  <TableCell align="right">
                    {parseFloat(String(miner.hardware?.hashRate || 0)).toFixed(
                      2,
                    )}{" "}
                    TH/s
                  </TableCell>
                  <TableCell align="right">
                    {miner.rate_per_kwh ? (
                      `$${Number(miner.rate_per_kwh).toFixed(2)}`
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
                    <Stack
                      direction="row"
                      spacing={1}
                      justifyContent="center"
                      sx={{ py: 1 }}
                    >
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onEdit(miner)}
                        disabled={isLoading}
                        title="Edit miner"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDeleteConfirm(miner.id)}
                        disabled={isLoading}
                        title="Delete miner"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
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
    </Box>
  );
}
