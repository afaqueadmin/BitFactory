"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
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
import { useQueryClient } from "@tanstack/react-query";
import SimulationSettingsCard from "@/components/simulation/SimulationSettingsCard";
import SimulatedLedgerDialog from "@/components/simulation/SimulatedLedgerDialog";
import { formatValue } from "@/lib/helpers/formatValue";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import Segmented from "@/components/daylight/Segmented";
import { useDaylight } from "@/lib/daylight";
import {
  DaylightAdminPage,
  DaylightLoading,
  DaylightPageHeader,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

interface SimulatedAccount {
  id: string;
  name: string | null;
  email: string;
  phoneNumber: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  active: boolean;
  balance: number;
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
 * account are reviewed here too, along with the simulation settings and each
 * account's simulated cost ledger.
 */
export default function SimulatedAccountsPage() {
  const { d } = useDaylight();
  const ds = useDaylightAdminSx();
  const [accounts, setAccounts] = useState<SimulatedAccount[]>([]);
  const [requests, setRequests] = useState<SimulationRequest[]>([]);
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [ledgerId, setLedgerId] = useState<string | null>(null);

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
      "Balance (USD)",
    ];
    const rows = visible.map((a) =>
      [
        a.name,
        a.email,
        a.phoneNumber,
        a.active ? "Active" : "Inactive",
        new Date(a.createdAt).toISOString(),
        a.lastLoginAt ? new Date(a.lastLoginAt).toISOString() : "",
        a.balance.toFixed(2),
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
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Simulated Accounts"
        description="People trying the app with simulated data from a real BitFactory miner."
        actions={
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            <Segmented
              ariaLabel="Account status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { id: "all", label: "All" },
                { id: "active", label: "Active" },
                { id: "inactive", label: "Inactive" },
              ]}
            />
            <Button
              variant="outlined"
              startIcon={<FileDownloadOutlinedIcon />}
              onClick={handleExport}
              disabled={visible.length === 0}
              sx={ds.outlineBtnSx}
            >
              Export CSV
            </Button>
          </Stack>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2, ...ds.alertSx("error") }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2, ...ds.alertSx("success") }}>
          {notice}
        </Alert>
      )}

      <SimulationSettingsCard onSaved={load} />

      {!loading && requests.length > 0 && (
        <Box component="section" sx={{ mb: { xs: "20px", md: "24px" } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography component="h2" sx={ds.sectionTitleSx}>
              Requests
            </Typography>
            <DaylightStatusPill
              label={String(requests.length)}
              tone="warning"
            />
          </Box>
          <Box sx={{ mt: "4px", mb: "12px", fontSize: 13, color: d.muted }}>
            Potential Customers asking to try a simulated account. Approving
            turns their existing account into one.
          </Box>
          <TableContainer component={Paper} elevation={0} sx={ds.tableCardSx}>
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
                  <TableRow key={r.id}>
                    <TableCell sx={{ "&&&": { fontWeight: 650 } }}>
                      {r.name || "—"}
                    </TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>{r.phoneNumber || "—"}</TableCell>
                    <TableCell sx={{ "&&&": { whiteSpace: "nowrap" } }}>
                      {formatDateTime(r.requestedAt)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ "&&&": { whiteSpace: "nowrap", py: "8px" } }}
                    >
                      <Button
                        size="small"
                        onClick={() => handleRequest(r, "approve")}
                        disabled={busyId === r.id}
                        sx={ds.textBtnSx("success")}
                      >
                        Approve
                      </Button>
                      <Button
                        size="small"
                        onClick={() => handleRequest(r, "decline")}
                        disabled={busyId === r.id}
                        sx={ds.textBtnSx("danger")}
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
        <DaylightLoading />
      ) : (
        <TableContainer component={Paper} elevation={0} sx={ds.tableCardSx}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Registered</TableCell>
                <TableCell>Last login</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    align="center"
                    sx={{ "&&&": { py: 5, color: d.muted } }}
                  >
                    {accounts.length === 0
                      ? "No simulated accounts yet."
                      : "No accounts match this filter."}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell sx={{ "&&&": { fontWeight: 650 } }}>
                      {a.name || "—"}
                    </TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell sx={{ "&&&": { whiteSpace: "nowrap" } }}>
                      {a.phoneNumber || "—"}
                    </TableCell>
                    <TableCell>
                      <DaylightStatusPill
                        label={a.active ? "Active" : "Inactive"}
                        tone={a.active ? "success" : "neutral"}
                      />
                    </TableCell>
                    <TableCell sx={{ "&&&": { whiteSpace: "nowrap" } }}>
                      {formatDateTime(a.createdAt)}
                    </TableCell>
                    <TableCell
                      sx={{
                        "&&&": {
                          whiteSpace: "nowrap",
                          color: a.lastLoginAt ? d.text : d.muted,
                        },
                      }}
                    >
                      {formatDateTime(a.lastLoginAt)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        "&&&": {
                          whiteSpace: "nowrap",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                        },
                      }}
                    >
                      {formatValue(a.balance, "currency")}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ "&&&": { py: "6px", minWidth: 200 } }}
                    >
                      {/* Wraps onto a second line rather than pushing the
                          last actions out of view. */}
                      <Box
                        sx={{
                          display: "flex",
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                          columnGap: 0.5,
                        }}
                      >
                        <Button
                          size="small"
                          onClick={() => setLedgerId(a.id)}
                          sx={ds.textBtnSx()}
                        >
                          Ledger
                        </Button>
                        <Button
                          size="small"
                          href={`/customers/${a.id}/wallet-email`}
                          target="_blank"
                          rel="noopener"
                          sx={ds.textBtnSx()}
                        >
                          Email wallet
                        </Button>
                        {a.active && (
                          <Button
                            size="small"
                            onClick={() => handleConvert(a)}
                            disabled={busyId === a.id}
                            sx={ds.textBtnSx()}
                          >
                            Convert to customer
                          </Button>
                        )}
                        {a.active ? (
                          <Button
                            size="small"
                            onClick={() => handleStatus(a, false)}
                            disabled={busyId === a.id}
                            sx={ds.textBtnSx("danger")}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            onClick={() => handleStatus(a, true)}
                            disabled={busyId === a.id}
                            sx={ds.textBtnSx("success")}
                          >
                            Activate
                          </Button>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <SimulatedLedgerDialog
        accountId={ledgerId}
        onClose={() => setLedgerId(null)}
        onChanged={load}
      />
    </DaylightAdminPage>
  );
}
