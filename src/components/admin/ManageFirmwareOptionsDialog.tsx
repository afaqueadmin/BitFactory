"use client";

/**
 * Admin dialog for the firmware list clients pick from when requesting a
 * firmware change: add, activate/deactivate, and delete. An option a request
 * has used can't be deleted - only deactivated, which hides it from clients -
 * so its Delete button is disabled; the API refuses it too (409).
 */

import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Switch,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  useFirmwareOptions,
  useManageFirmwareOptions,
  FirmwareOptionItem,
} from "@/lib/hooks/useFirmwareOptions";
import { MAX_FIRMWARE_NAME_LENGTH } from "@/lib/constants/firmware";

export default function ManageFirmwareOptionsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { options, loading, error } = useFirmwareOptions(
    { includeInactive: true },
    { enabled: open },
  );
  const { create, creating, update, updating, remove, removing } =
    useManageFirmwareOptions();

  const [newName, setNewName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = creating || updating || removing;

  const handleClose = () => {
    setNewName("");
    setActionError(null);
    onClose();
  };

  const handleAdd = async () => {
    setActionError(null);
    const name = newName.trim();
    if (!name) {
      setActionError("Enter a firmware name");
      return;
    }
    try {
      await create({ name });
      setNewName("");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to add firmware option",
      );
    }
  };

  const handleToggle = async (option: FirmwareOptionItem) => {
    setActionError(null);
    try {
      await update({ id: option.id, isActive: !option.isActive });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update firmware option",
      );
    }
  };

  const handleDelete = async (option: FirmwareOptionItem) => {
    setActionError(null);
    if (!window.confirm(`Delete firmware option "${option.name}"?`)) return;
    try {
      await remove(option.id);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete firmware option",
      );
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Manage Firmware Options</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {actionError && <Alert severity="error">{actionError}</Alert>}

          <Typography variant="body2" color="text.secondary">
            Clients choose from the active options when requesting a firmware
            change. An option that has been requested can&apos;t be deleted -
            deactivate it to hide it from clients instead.
          </Typography>

          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              size="small"
              label="New firmware"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              fullWidth
              inputProps={{ maxLength: MAX_FIRMWARE_NAME_LENGTH }}
            />
            <Button
              variant="contained"
              onClick={handleAdd}
              disabled={busy}
              startIcon={creating ? <CircularProgress size={16} /> : undefined}
            >
              Add
            </Button>
          </Box>

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : options.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No firmware options yet. Clients can&apos;t request a firmware
              change until at least one is added.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Active</TableCell>
                    <TableCell align="right">Requests</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {options.map((option) => {
                    const used = (option._count?.requests ?? 0) > 0;
                    return (
                      <TableRow key={option.id}>
                        <TableCell sx={{ opacity: option.isActive ? 1 : 0.6 }}>
                          {option.name}
                        </TableCell>
                        <TableCell>
                          <Switch
                            size="small"
                            checked={option.isActive}
                            disabled={busy}
                            onChange={() => handleToggle(option)}
                          />
                        </TableCell>
                        <TableCell align="right">
                          {option._count?.requests ?? 0}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip
                            title={
                              used
                                ? "Used by requests - deactivate instead"
                                : "Delete"
                            }
                          >
                            {/* span so the tooltip still shows when disabled */}
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={used || busy}
                                onClick={() => handleDelete(option)}
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
