"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { paymentTypeLabel } from "@/lib/accounting/paymentTypes";
import { formatValue } from "@/lib/helpers/formatValue";

interface LedgerEntry {
  id: string;
  createdAt: string;
  amount: number;
  consumption: number;
  type: string;
  narration: string | null;
  balance: number;
}

interface LedgerResponse {
  account: { id: string; name: string | null; email: string };
  balance: number;
  dailyCost: number;
  daysLeft: number | null;
  entries: LedgerEntry[];
}

/**
 * One simulated account's cost ledger for admins: balance, daily cost and
 * days left as the customer sees them, every entry with its running
 * balance, and adding a payment or adjustment or removing an entry - what
 * the customer page offers for a real client's cost payments.
 */
export default function SimulatedLedgerDialog({
  accountId,
  onClose,
  onChanged,
}: {
  accountId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"PAYMENT" | "ADJUSTMENT">("PAYMENT");
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/simulated-accounts/${accountId}/entries`, {
        credentials: "include",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load the ledger");
      setData(body);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load the ledger",
      );
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    setData(null);
    setAmount("");
    setNarration("");
    setType("PAYMENT");
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!accountId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/simulated-accounts/${accountId}/entries`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amount: Number(amount),
          narration: narration || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to add the entry");
      setAmount("");
      setNarration("");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add the entry");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (entry: LedgerEntry) => {
    if (
      !accountId ||
      !window.confirm(
        `Remove this ${paymentTypeLabel(entry.type)} entry of ${formatValue(entry.amount, "currency")}?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/simulated-accounts/${accountId}/entries/${entry.id}`,
        { method: "DELETE", credentials: "include" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to remove the entry");
      await load();
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove the entry",
      );
    } finally {
      setBusy(false);
    }
  };

  const who = data ? data.account.name || data.account.email : "";

  return (
    <Dialog open={!!accountId} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Simulated ledger{who ? ` - ${who}` : ""}</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {loading && !data ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : data ? (
          <>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={3} mb={2}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Balance
                </Typography>
                <Typography variant="h6" fontWeight={700}>
                  {formatValue(data.balance, "currency")}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Daily cost
                </Typography>
                <Typography variant="h6" fontWeight={700}>
                  {formatValue(data.dailyCost, "currency")}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Mining days left
                </Typography>
                <Typography variant="h6" fontWeight={700}>
                  {data.daysLeft === null ? "∞" : data.daysLeft}
                </Typography>
              </Box>
            </Stack>

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              mb={2}
              alignItems={{ sm: "flex-start" }}
            >
              <TextField
                select
                size="small"
                label="Type"
                value={type}
                onChange={(e) =>
                  setType(e.target.value as "PAYMENT" | "ADJUSTMENT")
                }
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="PAYMENT">Payment</MenuItem>
                <MenuItem value="ADJUSTMENT">Adjustment</MenuItem>
              </TextField>
              <TextField
                size="small"
                label="Amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                helperText={type === "ADJUSTMENT" ? "Negative to deduct" : " "}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                }}
                sx={{ minWidth: 140 }}
              />
              <TextField
                size="small"
                label={
                  type === "ADJUSTMENT" ? "Narration (required)" : "Narration"
                }
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                inputProps={{ maxLength: 500 }}
                fullWidth
              />
              <Button
                variant="contained"
                onClick={handleAdd}
                disabled={
                  busy ||
                  !amount ||
                  Number(amount) === 0 ||
                  (type === "ADJUSTMENT" && !narration.trim())
                }
                sx={{ whiteSpace: "nowrap", minWidth: 90 }}
              >
                Add
              </Button>
            </Stack>

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Consumption</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell align="right">Balance</TableCell>
                    <TableCell>Narration</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                        No entries yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.entries.map((e) => (
                      <TableRow key={e.id} hover>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {new Date(e.createdAt).toLocaleDateString("en-GB")}
                        </TableCell>
                        <TableCell>{paymentTypeLabel(e.type)}</TableCell>
                        <TableCell align="right">
                          {e.consumption > 0
                            ? `${e.consumption.toFixed(2)} kWh`
                            : "N/A"}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            color: e.amount < 0 ? "error.main" : "success.main",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatValue(e.amount, "currency")}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                          {formatValue(e.balance, "currency")}
                        </TableCell>
                        <TableCell>{e.narration || "-"}</TableCell>
                        <TableCell align="right">
                          <Tooltip title="Remove entry">
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => handleRemove(e)}
                                disabled={busy}
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
