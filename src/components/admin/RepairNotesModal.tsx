import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  TextField,
  Box,
  CircularProgress,
  Alert,
  Divider,
  IconButton,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";

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
  readonly?: boolean;
}

export default function RepairNotesModal({
  open,
  onClose,
  minerId,
  minerName,
  readonly = false,
}: RepairNotesModalProps) {
  const [notes, setNotes] = useState<RepairNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [newNote, setNewNote] = useState("");
  const [dateOfEntry, setDateOfEntry] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && minerId) {
      fetchNotes();
      // Reset form on open
      setNewNote("");
      setDateOfEntry(new Date().toISOString().split("T")[0]);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !minerId) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/machine/${minerId}/repair-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: newNote,
          dateOfEntry: new Date(dateOfEntry).toISOString(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to add repair note");
      }

      // Add to list and clear form
      setNotes([data.data, ...notes]);
      setNewNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    // Add confirmation if needed, skipping for quick workflow
    if (!window.confirm("Are you sure you want to delete this repair note?"))
      return;

    try {
      const response = await fetch(`/api/machine/repair-notes/${noteId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete note");
      }

      setNotes(notes.filter((n) => n.id !== noteId));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred deleting the note",
      );
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
      <DialogTitle>Repair Notes - {minerName}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Add New Note Form */}
        {!readonly && (
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              mb: 4,
              p: 2,
              bgcolor: "action.hover",
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
              Add New Repair Note
            </Typography>
            <TextField
              label="Date of Entry"
              type="date"
              size="small"
              value={dateOfEntry}
              onChange={(e) => setDateOfEntry(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              required
            />
            <TextField
              label="Repair Details"
              multiline
              rows={3}
              size="small"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Describe the repair issue and action taken..."
              fullWidth
              required
            />
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={submitting || !newNote.trim()}
              sx={{ alignSelf: "flex-end" }}
            >
              {submitting ? <CircularProgress size={24} /> : "Record Note"}
            </Button>
          </Box>
        )}

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
                  position: "relative",
                }}
              >
                {!readonly && (
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDeleteNote(note.id)}
                    sx={{ position: "absolute", top: 8, right: 8 }}
                    title="Delete Note"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    mb: 1,
                    pr: 4,
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
