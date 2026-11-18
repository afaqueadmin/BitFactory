"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { useDaylightAdminSx } from "@/components/daylight/AdminPage";

/**
 * Every Wallets-module action needs a note saying why - it goes into the
 * audit log. Shared confirm dialog for those actions.
 */
export default function NoteActionDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const ds = useDaylightAdminSx();
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) setNote("");
  }, [open]);
  const valid = note.trim().length >= 3;

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography component="div" sx={{ fontSize: 14, mb: 2 }}>
          {description}
        </Typography>
        <TextField
          id="wallet-action-note"
          label="Note (required)"
          placeholder="What you checked or changed, and with whom"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          multiline
          minRows={3}
          fullWidth
          autoFocus
          sx={ds.inputSx}
          helperText="Saved in the audit log."
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={ds.outlineBtnSx}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!valid || busy}
          onClick={() => onConfirm(note.trim())}
          sx={ds.primaryBtnSx}
        >
          {busy ? "Working…" : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
