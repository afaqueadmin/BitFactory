"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";

interface SimulatedAccount {
  id: string;
  name: string | null;
  email: string;
  phoneNumber: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  active: boolean;
}

interface SimulationRequest {
  id: string;
  name: string | null;
  email: string;
  phoneNumber: string | null;
  requestedAt: string;
}

type StatusFilter = "all" | "active" | "inactive";

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
 * their contact details for sales and marketing. Accounts are deactivated
 * rather than deleted, so every lead stays listed; an active one can also be
 * turned into a real customer. Potential Customers' requests for a simulated
 * account are reviewed here too.
 */
export default function SimulatedAccountsPage() {
  const [accounts, setAccounts] = useState<SimulatedAccount[]>([]);
  const [requests, setRequests] = useState<SimulationRequest[]>([]);
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const visible = accounts.filter(
    (a) => statusFilter === "all" || a.active === (statusFilter === "active"),
  );

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
      setRequests(data.requests ?? []);
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

  const handleRequest = async (
    req: SimulationRequest,
    action: "approve" | "decline",
  ) => {
    const who = req.name || req.email;
    if (
      !window.confirm(
        action === "approve"
          ? `Turn ${who}'s account into a simulated account? They keep the same login, are signed out once and get an email that it's ready.`
          : `Decline ${who}'s request? They can ask again later.`,
      )
    ) {
      return;
    }
    setBusyId(req.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/simulated-accounts/requests/${req.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to review request");
      setNotice(data.message);
      await load();
      // Refresh the sidebar's request badge.
      queryClient.invalidateQueries({ queryKey: ["simulation-request-count"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to review request");
    } finally {
      setBusyId(null);
    }
  };

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

  const handleStatus = async (account: SimulatedAccount, active: boolean) => {
    if (
      !active &&
      !window.confirm(
        `Deactivate the simulated account of ${label(account)}? They will be signed out and can't log in until it's activated again.`,
      )
    ) {
      return;
    }
    setBusyId(account.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/simulated-accounts/${account.id}/status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to change status");
      setNotice(data.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change status");
    } finally {
      setBusyId(null);
    }
  };

  const handleExport = () => {
    const header = [
      "Name",
      "Email",
      "Phone",
      "Status",
      "Registered",
      "Last login",
    ];
    const rows = visible.map((a) =>
      [
        a.name,
        a.email,
        a.phoneNumber,
        a.active ? "Active" : "Inactive",
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
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ToggleButtonGroup
            size="small"
            exclusive
            value={statusFilter}
            onChange={(_, value: StatusFilter | null) =>
              value && setStatusFilter(value)
            }
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="active">Active</ToggleButton>
            <ToggleButton value="inactive">Inactive</ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="outlined"
            onClick={handleExport}
            disabled={visible.length === 0}
          >
            Export CSV
          </Button>
        </Stack>
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

      {!loading && requests.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" fontWeight={700} mb={1}>
            Requests ({requests.length})
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={1.5}>
            Potential Customers asking to try a simulated account. Approving
            turns their existing account into one.
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Requested</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.name || "-"}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>{r.phoneNumber || "-"}</TableCell>
                    <TableCell>{formatDateTime(r.requestedAt)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Button
                        size="small"
                        color="success"
                        onClick={() => handleRequest(r, "approve")}
                        disabled={busyId === r.id}
                      >
                        Approve
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => handleRequest(r, "decline")}
                        disabled={busyId === r.id}
                      >
                        Decline
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
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
                <TableCell>Status</TableCell>
                <TableCell>Registered</TableCell>
                <TableCell>Last login</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    {accounts.length === 0
                      ? "No simulated accounts yet."
                      : "No accounts match this filter."}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell>{a.name || "-"}</TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell>{a.phoneNumber || "-"}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={a.active ? "Active" : "Inactive"}
                        color={a.active ? "success" : "default"}
                        variant={a.active ? "filled" : "outlined"}
                      />
                    </TableCell>
                    <TableCell>{formatDateTime(a.createdAt)}</TableCell>
                    <TableCell>{formatDateTime(a.lastLoginAt)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {a.active && (
                        <Button
                          size="small"
                          onClick={() => handleConvert(a)}
                          disabled={busyId === a.id}
                        >
                          Convert to customer
                        </Button>
                      )}
                      {a.active ? (
                        <Button
                          size="small"
                          color="error"
                          onClick={() => handleStatus(a, false)}
                          disabled={busyId === a.id}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          color="success"
                          onClick={() => handleStatus(a, true)}
                          disabled={busyId === a.id}
                        >
                          Activate
                        </Button>
                      )}
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
