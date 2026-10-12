import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Divider,
} from "@mui/material";

interface User {
  id: string;
  name: string | null;
  email: string;
}

export interface RepairNote {
  id: string;
  minerId: string;
  note: string;
  dateOfEntry: string;
  createdBy: User;
  createdAt: string;
}

interface RepairNotesModalProps {
  open: boolean;
  onClose: () => void;
  minerId: string | null;
  minerName: string;
  serialNumber?: string | null;
  macAddress?: string | null;
}

/**
 * Read-only repair history for a miner. Notes are created, updated and
 * deleted only through Hardware Repair invoices.
 */
export default function RepairNotesModal({
  open,
  onClose,
  minerId,
  minerName,
  serialNumber,
  macAddress,
}: RepairNotesModalProps) {
  const [notes, setNotes] = useState<RepairNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && minerId) {
      fetchNotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, minerId]);

  const fetchNotes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/machine/${minerId}/repair-notes`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch repair notes");
      }
      setNotes(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        Repair Notes - {minerName}
        {(serialNumber || macAddress) && (
          <Box sx={{ mt: 1, display: "flex", gap: 3 }}>
            {serialNumber && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Serial No.
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontFamily: "monospace", fontWeight: 600 }}
                >
                  {serialNumber}
                </Typography>
              </Box>
            )}
            {macAddress && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  MAC Address
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontFamily: "monospace", fontWeight: 600 }}
                >
                  {macAddress}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 1 }}
        >
          Repair notes are managed from Hardware Repair invoices.
        </Typography>

        <Divider sx={{ mb: 2 }} />

        {/* List of Existing Notes */}
        <Typography variant="subtitle2" sx={{ fontWeight: "bold", mb: 2 }}>
          History ({notes.length})
        </Typography>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : notes.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
            No repair notes recorded for this miner yet.
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {notes.map((note) => (
              <Box
                key={note.id}
                sx={{
                  p: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    mb: 1,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: "bold", color: "primary.main" }}
                  >
                    {formatDate(note.dateOfEntry)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    By:{" "}
                    {note.createdBy?.name || note.createdBy?.email || "Unknown"}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {note.note}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
