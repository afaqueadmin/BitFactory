"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Paper,
  Alert,
  Snackbar,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import { DaylightThemedPage } from "@/components/daylight/DaylightMuiScope";
import {
  DaylightLoading,
  DaylightPageHeader,
} from "@/components/daylight/AdminPage";

export default function ExternalResourcePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchResource();
  }, []);

  const fetchResource = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/external-resource?key=hosted-miners-sheet");
      if (!res.ok) {
        throw new Error("Failed to fetch external resource");
      }
      const data = await res.json();
      if (data.resource) {
        setUrl(data.resource.url);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!url.trim()) {
      setError("URL cannot be empty");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/external-resource", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: "hosted-miners-sheet",
          url: url.trim(),
          label: "Hosted Miners",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save external resource");
      }

      setSuccess(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An error occurred while saving";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DaylightThemedPage>
        <DaylightLoading />
      </DaylightThemedPage>
    );
  }

  return (
    <DaylightThemedPage>
      <Box sx={{ maxWidth: 1200, mx: "auto" }}>
        <DaylightPageHeader
          title="External Resource"
          description="Links to external data sources used by the dashboard."
        />

        <Paper sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>
            Hosted Miners Link
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
            Add or update the Google Sheet link for Hosted Miners. This will be
            visible to the system backend or dashboard.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <Box component="form" noValidate autoComplete="off">
            <TextField
              fullWidth
              label="Google Sheet URL"
              variant="outlined"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              sx={{ mb: 3 }}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />

            <Button
              variant="contained"
              color="primary"
              startIcon={
                saving ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <SaveIcon />
                )
              }
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Link"}
            </Button>
          </Box>
        </Paper>

        <Snackbar
          open={success}
          autoHideDuration={4000}
          onClose={() => setSuccess(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert
            onClose={() => setSuccess(false)}
            severity="success"
            sx={{ width: "100%" }}
          >
            Link saved successfully!
          </Alert>
        </Snackbar>
      </Box>
    </DaylightThemedPage>
  );
}
