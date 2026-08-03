"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Container,
  Typography,
  Button,
  Stack,
  Alert,
  Snackbar,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Checkbox,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
} from "@mui/material";
import {
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
} from "@mui/icons-material";
import AdminValueCard from "@/components/admin/AdminValueCard";
import { formatValue } from "@/lib/helpers/formatValue";

type IncentiveType =
  | "HARDWARE_SALE"
  | "OWN_MACHINE_HOSTING_REBATE"
  | "CLIENT_HOSTING_COMMISSION";

const TYPE_LABELS: Record<IncentiveType, string> = {
  HARDWARE_SALE: "Hardware Sale",
  OWN_MACHINE_HOSTING_REBATE: "Own-Machine Hosting Rebate",
  CLIENT_HOSTING_COMMISSION: "Client Hosting Commission",
};

interface IncentiveRate {
  id: string;
  incentiveType: IncentiveType;
  rateBasis: "FLAT_PER_UNIT" | "PERCENTAGE" | null;
  flatAmount: string | null;
  percentage: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdByUser: { name: string | null; email: string };
}

interface IncentiveEntry {
  id: string;
  incentiveType: IncentiveType;
  sourceInvoiceNumber: string;
  clientUser: { id: string; name: string | null; email: string } | null;
  basisAmount: string;
  rateApplied: string;
  amount: string;
  status: "ACCRUED" | "REVERSED";
  accrualDate: string;
  payoutBatch: { id: string; paidDate: string } | null;
}

function describeRate(rate: IncentiveRate): string {
  if (rate.incentiveType === "CLIENT_HOSTING_COMMISSION") {
    return `${rate.percentage}% of client invoice`;
  }
  if (rate.incentiveType === "OWN_MACHINE_HOSTING_REBATE") {
    return `${formatValue(Number(rate.flatAmount), "currency")} / machine / month`;
  }
  // HARDWARE_SALE
  return rate.rateBasis === "PERCENTAGE"
    ? `${rate.percentage}% of sale amount`
    : `${formatValue(Number(rate.flatAmount), "currency")} / unit`;
}

export default function FranchiseIncentivesAdminPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const franchiseId = params.id as string;

  const [notification, setNotification] = useState("");
  const [error, setError] = useState("");
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [payoutMode, setPayoutMode] = useState<"selected" | "all">("selected");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [entryFilter, setEntryFilter] = useState<{
    paid: string;
    type: string;
  }>({ paid: "", type: "" });

  const [rateForm, setRateForm] = useState({
    incentiveType: "CLIENT_HOSTING_COMMISSION" as IncentiveType,
    rateBasis: "PERCENTAGE" as "FLAT_PER_UNIT" | "PERCENTAGE",
    flatAmount: "",
    percentage: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });

  const { data: franchisesData } = useQuery<{
    data: { id: string; businessName: string }[];
  }>({
    queryKey: ["franchisees"],
    queryFn: async () => {
      const res = await fetch("/api/franchisees");
      if (!res.ok) throw new Error("Failed to fetch franchisees");
      return res.json();
    },
  });
  const franchise = franchisesData?.data?.find((f) => f.id === franchiseId);

  const { data: ratesData, isLoading: ratesLoading } = useQuery<{
    rates: IncentiveRate[];
  }>({
    queryKey: ["incentiveRates", franchiseId],
    queryFn: async () => {
      const res = await fetch(
        `/api/incentives/rates?franchiseId=${franchiseId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch incentive rates");
      return res.json();
    },
  });

  const { data: entriesData, isLoading: entriesLoading } = useQuery<{
    entries: IncentiveEntry[];
  }>({
    queryKey: ["incentiveEntries", franchiseId, entryFilter],
    queryFn: async () => {
      const url = new URL("/api/incentives/entries", window.location.origin);
      url.searchParams.set("franchiseId", franchiseId);
      url.searchParams.set("limit", "100");
      if (entryFilter.paid) url.searchParams.set("paid", entryFilter.paid);
      if (entryFilter.type)
        url.searchParams.set("incentiveType", entryFilter.type);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch incentive entries");
      return res.json();
    },
  });

  const rates = ratesData?.rates ?? [];
  const currentRates = (
    [
      "HARDWARE_SALE",
      "OWN_MACHINE_HOSTING_REBATE",
      "CLIENT_HOSTING_COMMISSION",
    ] as IncentiveType[]
  )
    .map((type) =>
      rates.find((r) => r.incentiveType === type && !r.effectiveTo),
    )
    .filter((r): r is IncentiveRate => Boolean(r));

  const entries = entriesData?.entries ?? [];
  const unpaidEntries = entries.filter(
    (e) => e.status === "ACCRUED" && !e.payoutBatch,
  );
  const totalUnpaid = unpaidEntries.reduce(
    (sum, e) => sum + Number(e.amount),
    0,
  );

  const handleCreateRate = async () => {
    setSubmitting(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        franchiseId,
        incentiveType: rateForm.incentiveType,
        effectiveFrom: rateForm.effectiveFrom,
      };
      if (rateForm.incentiveType === "HARDWARE_SALE") {
        body.rateBasis = rateForm.rateBasis;
        if (rateForm.rateBasis === "FLAT_PER_UNIT") {
          body.flatAmount = rateForm.flatAmount;
        } else {
          body.percentage = rateForm.percentage;
        }
      } else if (rateForm.incentiveType === "OWN_MACHINE_HOSTING_REBATE") {
        body.flatAmount = rateForm.flatAmount;
      } else {
        body.percentage = rateForm.percentage;
      }

      const res = await fetch("/api/incentives/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create rate");

      setNotification("Incentive rate created");
      setRateModalOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["incentiveRates", franchiseId],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rate");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePayout = async () => {
    setSubmitting(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        franchiseId,
        notes: payoutNotes || undefined,
      };
      if (payoutMode === "selected") {
        body.entryIds = selectedEntryIds;
      }

      const res = await fetch("/api/incentives/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create payout");

      setNotification("Payout recorded");
      setPayoutDialogOpen(false);
      setSelectedEntryIds([]);
      setPayoutNotes("");
      queryClient.invalidateQueries({
        queryKey: ["incentiveEntries", franchiseId],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create payout");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEntrySelection = (id: string) => {
    setSelectedEntryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const loading = ratesLoading || entriesLoading;

  return (
    <Box
      component="main"
      sx={{ py: 4, backgroundColor: "background.default", minHeight: "100vh" }}
    >
      <Container maxWidth="xl">
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <IconButton onClick={() => router.push("/franchisees")} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" sx={{ fontWeight: "bold" }}>
            Incentives — {franchise?.businessName ?? "Franchise"}
          </Typography>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 3,
                mb: 4,
              }}
            >
              <AdminValueCard
                title="Unpaid Incentives"
                borderColor="#FF9800"
                value={totalUnpaid}
                type="currency"
              />
              <AdminValueCard
                title="Unpaid Entries"
                borderColor="#FF9800"
                value={unpaidEntries.length}
              />
            </Box>

            {/* Current Rates */}
            <Paper sx={{ p: 3, mb: 4 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 2 }}
              >
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Incentive Rates
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setRateModalOpen(true)}
                >
                  Add Rate
                </Button>
              </Stack>

              {currentRates.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No active rates configured for this franchise yet.
                </Typography>
              ) : (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
                    gap: 2,
                  }}
                >
                  {currentRates.map((rate) => (
                    <Paper
                      key={rate.id}
                      variant="outlined"
                      sx={{ p: 2, borderRadius: 2 }}
                    >
                      <Typography variant="subtitle2" color="text.secondary">
                        {TYPE_LABELS[rate.incentiveType]}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {describeRate(rate)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Effective from{" "}
                        {new Date(rate.effectiveFrom).toLocaleDateString()}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              )}

              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Rate History
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Type</TableCell>
                        <TableCell>Value</TableCell>
                        <TableCell>Effective From</TableCell>
                        <TableCell>Effective To</TableCell>
                        <TableCell>Created By</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rates.map((rate) => (
                        <TableRow key={rate.id}>
                          <TableCell>
                            {TYPE_LABELS[rate.incentiveType]}
                          </TableCell>
                          <TableCell>{describeRate(rate)}</TableCell>
                          <TableCell>
                            {new Date(rate.effectiveFrom).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {rate.effectiveTo
                              ? new Date(rate.effectiveTo).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {rate.createdByUser.name ||
                              rate.createdByUser.email}
                          </TableCell>
                        </TableRow>
                      ))}
                      {rates.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} align="center">
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ py: 2 }}
                            >
                              No rates yet.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Paper>

            {/* Ledger + Payouts */}
            <Paper sx={{ p: 3 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 2 }}
                flexWrap="wrap"
                gap={2}
              >
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Incentive Ledger
                </Typography>
                <Stack direction="row" spacing={1}>
                  <TextField
                    select
                    size="small"
                    label="Type"
                    value={entryFilter.type}
                    onChange={(e) =>
                      setEntryFilter((f) => ({ ...f, type: e.target.value }))
                    }
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value="">All Types</MenuItem>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <MenuItem key={value} value={value}>
                        {label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Paid"
                    value={entryFilter.paid}
                    onChange={(e) =>
                      setEntryFilter((f) => ({ ...f, paid: e.target.value }))
                    }
                    sx={{ minWidth: 120 }}
                  >
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="true">Paid</MenuItem>
                    <MenuItem value="false">Unpaid</MenuItem>
                  </TextField>
                  <Button
                    variant="outlined"
                    disabled={selectedEntryIds.length === 0}
                    onClick={() => {
                      setPayoutMode("selected");
                      setPayoutDialogOpen(true);
                    }}
                  >
                    Pay Selected ({selectedEntryIds.length})
                  </Button>
                  <Button
                    variant="contained"
                    disabled={unpaidEntries.length === 0}
                    onClick={() => {
                      setPayoutMode("all");
                      setPayoutDialogOpen(true);
                    }}
                  >
                    Pay All Unpaid
                  </Button>
                </Stack>
              </Stack>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" />
                      <TableCell>Date</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Client</TableCell>
                      <TableCell>Source Invoice</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Paid</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {entries.map((entry) => {
                      const payable =
                        entry.status === "ACCRUED" && !entry.payoutBatch;
                      return (
                        <TableRow key={entry.id} hover>
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              disabled={!payable}
                              checked={selectedEntryIds.includes(entry.id)}
                              onChange={() => toggleEntrySelection(entry.id)}
                            />
                          </TableCell>
                          <TableCell>
                            {new Date(entry.accrualDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {TYPE_LABELS[entry.incentiveType]}
                          </TableCell>
                          <TableCell>
                            {entry.clientUser
                              ? entry.clientUser.name || entry.clientUser.email
                              : "Own Machines"}
                          </TableCell>
                          <TableCell>{entry.sourceInvoiceNumber}</TableCell>
                          <TableCell align="right">
                            {formatValue(Number(entry.amount), "currency")}
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={entry.status}
                              color={
                                entry.status === "ACCRUED"
                                  ? "success"
                                  : "default"
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={entry.payoutBatch ? "Paid" : "Unpaid"}
                              color={entry.payoutBatch ? "success" : "warning"}
                              variant={
                                entry.payoutBatch ? "filled" : "outlined"
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {entries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} align="center">
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ py: 3 }}
                          >
                            No incentive entries yet.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </>
        )}

        {/* Add Rate Dialog */}
        <Dialog
          open={rateModalOpen}
          onClose={() => (submitting ? null : setRateModalOpen(false))}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Add Incentive Rate</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                select
                label="Incentive Type"
                value={rateForm.incentiveType}
                onChange={(e) =>
                  setRateForm((f) => ({
                    ...f,
                    incentiveType: e.target.value as IncentiveType,
                  }))
                }
                fullWidth
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>

              {rateForm.incentiveType === "HARDWARE_SALE" && (
                <TextField
                  select
                  label="Rate Basis"
                  value={rateForm.rateBasis}
                  onChange={(e) =>
                    setRateForm((f) => ({
                      ...f,
                      rateBasis: e.target.value as
                        | "FLAT_PER_UNIT"
                        | "PERCENTAGE",
                    }))
                  }
                  fullWidth
                >
                  <MenuItem value="FLAT_PER_UNIT">
                    Flat $ per unit sold
                  </MenuItem>
                  <MenuItem value="PERCENTAGE">% of sale amount</MenuItem>
                </TextField>
              )}

              {(rateForm.incentiveType === "OWN_MACHINE_HOSTING_REBATE" ||
                (rateForm.incentiveType === "HARDWARE_SALE" &&
                  rateForm.rateBasis === "FLAT_PER_UNIT")) && (
                <TextField
                  label={
                    rateForm.incentiveType === "OWN_MACHINE_HOSTING_REBATE"
                      ? "$ per machine / month"
                      : "$ per unit"
                  }
                  type="number"
                  value={rateForm.flatAmount}
                  onChange={(e) =>
                    setRateForm((f) => ({ ...f, flatAmount: e.target.value }))
                  }
                  fullWidth
                />
              )}

              {(rateForm.incentiveType === "CLIENT_HOSTING_COMMISSION" ||
                (rateForm.incentiveType === "HARDWARE_SALE" &&
                  rateForm.rateBasis === "PERCENTAGE")) && (
                <TextField
                  label="Percentage"
                  type="number"
                  value={rateForm.percentage}
                  onChange={(e) =>
                    setRateForm((f) => ({ ...f, percentage: e.target.value }))
                  }
                  fullWidth
                />
              )}

              <TextField
                label="Effective From"
                type="date"
                value={rateForm.effectiveFrom}
                onChange={(e) =>
                  setRateForm((f) => ({ ...f, effectiveFrom: e.target.value }))
                }
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button
              onClick={() => setRateModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateRate}
              variant="contained"
              disabled={submitting}
            >
              {submitting ? <CircularProgress size={20} /> : "Create Rate"}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Payout Dialog */}
        <Dialog
          open={payoutDialogOpen}
          onClose={() => (submitting ? null : setPayoutDialogOpen(false))}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Record Payout</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {payoutMode === "selected"
                ? `Mark ${selectedEntryIds.length} selected entries as paid.`
                : `Mark all ${unpaidEntries.length} outstanding entries (${formatValue(totalUnpaid, "currency")}) as paid.`}
            </Typography>
            <TextField
              label="Notes (optional)"
              value={payoutNotes}
              onChange={(e) => setPayoutNotes(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button
              onClick={() => setPayoutDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreatePayout}
              variant="contained"
              disabled={submitting}
            >
              {submitting ? <CircularProgress size={20} /> : "Confirm Payout"}
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={Boolean(notification)}
          autoHideDuration={5000}
          onClose={() => setNotification("")}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={() => setNotification("")}
            severity="success"
            sx={{ width: "100%" }}
          >
            {notification}
          </Alert>
        </Snackbar>
      </Container>
    </Box>
  );
}
