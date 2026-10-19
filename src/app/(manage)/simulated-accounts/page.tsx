"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

interface SimulatedAccount {
  id: string;
  name: string | null;
  email: string;
  phoneNumber: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

const formatDateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Never";

const csvCell = (value: string | null) =>
  `"${(value ?? "").replace(/"/g, '""')}"`;

/**
 * Simulated (SIMULATED) accounts: the people who signed up to try the app, with
 * their contact details for sales and marketing. An account can be turned
 * into a real customer or deleted from here.
 */
export default function SimulatedAccountsPage() {
  const [accounts, setAccounts] = useState<SimulatedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulated-accounts", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setAccounts(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const label = (a: SimulatedAccount) => a.name || a.email;

  const handleConvert = async (account: SimulatedAccount) => {
    if (
      !window.confirm(
        `Convert ${label(account)} into a real customer? They keep the same login and will be signed out once.`,
      )
    ) {
      return;
    }
    setBusyId(account.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/simulated-accounts/${account.id}/convert`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to convert");
      setNotice(data.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to convert");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (account: SimulatedAccount) => {
    if (!window.confirm(`Delete the simulated account of ${label(account)}?`)) {
      return;
    }
    setBusyId(account.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/user/${account.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      setNotice(`Deleted the simulated account of ${label(account)}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusyId(null);
    }
  };

  const handleExport = () => {
    const header = ["Name", "Email", "Phone", "Registered", "Last login"];
    const rows = accounts.map((a) =>
      [
        a.name,
        a.email,
        a.phoneNumber,
        new Date(a.createdAt).toISOString(),
        a.lastLoginAt ? new Date(a.lastLoginAt).toISOString() : "",
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...rows].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `simulated-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        spacing={2}
        mb={2}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Simulated Accounts
          </Typography>
          <Typography variant="body2" color="text.secondary">
            People trying the app with simulated data from a real BitFactory
            miner.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          onClick={handleExport}
          disabled={accounts.length === 0}
        >
          Export CSV
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Registered</TableCell>
                <TableCell>Last login</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    No simulated accounts yet.
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell>{a.name || "-"}</TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell>{a.phoneNumber || "-"}</TableCell>
                    <TableCell>{formatDateTime(a.createdAt)}</TableCell>
                    <TableCell>{formatDateTime(a.lastLoginAt)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Button
                        size="small"
                        onClick={() => handleConvert(a)}
                        disabled={busyId === a.id}
                      >
                        Convert to customer
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => handleDelete(a)}
                        disabled={busyId === a.id}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
