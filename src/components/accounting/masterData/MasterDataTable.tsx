"use client";

/**
 * Table and dialog pieces shared by the Finance Settings master-data pages
 * (Entities, Banks & Currencies; Vendors).
 */

import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Stack,
  TableCell,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ToggleOnIcon from "@mui/icons-material/ToggleOn";
import ToggleOffIcon from "@mui/icons-material/ToggleOff";
import { ReactNode, useState } from "react";
import { useSavePaymentAccount } from "@/lib/hooks/usePaymentAccounts";

export const inactiveRowSx = { opacity: 0.55 };

export function RowActions({
  isActive,
  onEdit,
  onToggle,
  onDelete,
  busy,
}: {
  isActive: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
      <Tooltip title="Edit">
        <IconButton size="small" onClick={onEdit} disabled={busy}>
          <EditIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={isActive ? "Deactivate" : "Activate"}>
        <IconButton size="small" onClick={onToggle} disabled={busy}>
          {isActive ? (
            <ToggleOnIcon fontSize="small" color="success" />
          ) : (
            <ToggleOffIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete">
        <IconButton size="small" onClick={onDelete} disabled={busy}>
          <DeleteIcon fontSize="small" color="error" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

export function ConfirmDeleteDialog({
  open,
  label,
  error,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  label: string;
  error: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Delete {label}?</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText>
            This can&apos;t be undone. Records in use can only be deactivated.
          </DialogContentText>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Deleting..." : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function FormDialog({
  open,
  title,
  error,
  busy,
  canSave,
  onCancel,
  onSave,
  children,
}: {
  open: boolean;
  title: string;
  error: string | null;
  busy: boolean;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {children}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onSave}
          disabled={busy || !canSave}
        >
          {busy ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function TableState({
  loading,
  error,
  empty,
  colSpan,
}: {
  loading: boolean;
  error: Error | null;
  empty: boolean;
  colSpan: number;
}) {
  if (!loading && !error && !empty) return null;
  return (
    <TableRow>
      <TableCell colSpan={colSpan} align="center" sx={{ py: 4 }}>
        {loading ? (
          <CircularProgress size={24} />
        ) : error ? (
          <Alert severity="error">{error.message}</Alert>
        ) : (
          <Typography color="text.secondary">Nothing added yet</Typography>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Edit/delete/toggle state shared by the master-data tables. `save` and `remove`
 * surface the API's error message (e.g. a 409 "in use") in the dialog.
 */
export function useRecordEditor<T extends { id: string }>(
  kind: "entities" | "banks" | "currencies" | "vendors",
) {
  const mutation = useSavePaymentAccount(kind);
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const close = () => {
    setEditing(null);
    setDeleting(null);
    setError(null);
  };

  const save = async (data: Record<string, unknown>) => {
    setError(null);
    try {
      await mutation.mutateAsync(
        editing && editing !== "new"
          ? { id: editing.id, method: "PUT", data }
          : { method: "POST", data },
      );
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setError(null);
    try {
      await mutation.mutateAsync({ id: deleting.id, method: "DELETE" });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const toggle = async (record: T & { isActive: boolean }) => {
    setPageError(null);
    try {
      await mutation.mutateAsync({
        id: record.id,
        method: "PUT",
        data: { isActive: !record.isActive },
      });
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  return {
    editing,
    setEditing,
    deleting,
    setDeleting,
    error,
    pageError,
    busy: mutation.isPending,
    close,
    save,
    remove,
    toggle,
  };
}
