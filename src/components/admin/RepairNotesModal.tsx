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
import EditIcon from "@mui/icons-material/Edit";

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
  readonly?: boolean;
}

export default function RepairNotesModal({
  open,
  onClose,
  minerId,
  minerName,
  serialNumber,
  macAddress,
  readonly = false,
}: RepairNotesModalProps) {
  const [notes, setNotes] = useState<RepairNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [dateOfEntry, setDateOfEntry] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && minerId) {
      fetchNotes();
      // Reset form on open
      setEditingNoteId(null);
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
      const url = editingNoteId
        ? `/api/machine/repair-notes/${editingNoteId}`
        : `/api/machine/${minerId}/repair-notes`;
      const method = editingNoteId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: newNote,
          dateOfEntry: new Date(dateOfEntry).toISOString(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save repair note");
      }

      if (editingNoteId) {
        setNotes(notes.map((n) => (n.id === editingNoteId ? data.data : n)));
        setEditingNoteId(null);
      } else {
        setNotes([data.data, ...notes]);
      }
      setNewNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditNote = (note: RepairNote) => {
    setEditingNoteId(note.id);
    setNewNote(note.note);
    setDateOfEntry(note.dateOfEntry.split("T")[0]);
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
              {editingNoteId ? "Edit Repair Note" : "Add New Repair Note"}
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
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
              {editingNoteId && (
                <Button
                  variant="outlined"
                  color="inherit"
                  disabled={submitting}
                  onClick={() => {
                    setEditingNoteId(null);
                    setNewNote("");
                    setDateOfEntry(new Date().toISOString().split("T")[0]);
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={submitting || !newNote.trim()}
              >
                {submitting ? (
                  <CircularProgress size={24} />
                ) : editingNoteId ? (
                  "Update Note"
                ) : (
                  "Record Note"
                )}
              </Button>
            </Box>
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
                  <Box
                    sx={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.5,
                    }}
                  >
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteNote(note.id)}
                      title="Delete Note"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => handleEditNote(note)}
                      title="Edit Note"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Box>
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
