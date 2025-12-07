/**
 * Miners Table Component
 *
 * Displays a list of miners with CRUD action buttons.
 * Integrates with MUI DataGrid for efficient data rendering.
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
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
} from "@mui/icons-material";

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
  status: "ACTIVE" | "INACTIVE";
  hardwareId: string;
  userId: string;
  spaceId: string;
  createdAt: string;
  updatedAt: string;
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
    status: "ACTIVE" | "INACTIVE",
  ): "success" | "default" => {
    return status === "ACTIVE" ? "success" : "default";
  };

  const memoizedRows = useMemo(() => miners, [miners]);

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer
        component={Paper}
        sx={{ backgroundColor: "background.paper" }}
      >
        <Table sx={{ minWidth: 650 }} aria-label="miners table">
          <TableHead sx={{ backgroundColor: "action.hover" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold" }}>Name</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Model</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>User</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Subaccount</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Space</TableCell>
              <TableCell sx={{ fontWeight: "bold" }} align="right">
                Power Usage (kWh)
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }} align="right">
                Hash Rate (TH/s)
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }} align="center">
                Status
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Created</TableCell>
              <TableCell sx={{ fontWeight: "bold" }} align="center">
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : memoizedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
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
