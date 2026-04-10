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
      <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 3 },
        mt: { xs: 1, sm: 2 },
        maxWidth: 1200,
        mx: "auto",
      }}
    >
      <Typography
        variant="h4"
        fontWeight="bold"
        gutterBottom
        sx={{
          color: (theme) =>
            theme.palette.mode === "dark" ? "primary.light" : "primary.dark",
          mb: 3,
          borderBottom: (theme) => `2px solid ${theme.palette.primary.main}`,
          pb: 1,
        }}
      >
        External Resource
      </Typography>

      <Paper
        elevation={3}
        sx={{
          p: { xs: 2, sm: 4 },
          mb: 4,
          borderRadius: 2,
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
              : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
          backdropFilter: "blur(10px)",
          border: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Typography
          variant="h6"
          fontWeight="medium"
          gutterBottom
          sx={{
            color: (theme) =>
              theme.palette.mode === "dark" ? "primary.light" : "primary.dark",
            mb: 1,
          }}
        >
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

        <Box component="form" noValidate autoComplete="off" sx={{ mt: 2 }}>
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
            sx={{
              px: 4,
              py: 1,
              background: (theme) =>
                `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
              boxShadow: (theme) =>
                `0 4px 20px ${theme.palette.primary.main}40`,
              "&:hover": {
                background: (theme) =>
                  `linear-gradient(45deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
                boxShadow: (theme) =>
                  `0 6px 25px ${theme.palette.primary.main}60`,
              },
            }}
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
  );
}
