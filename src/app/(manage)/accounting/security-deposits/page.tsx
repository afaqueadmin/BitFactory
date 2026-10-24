"use client";

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Link as MuiLink,
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
import DeleteIcon from "@mui/icons-material/Delete";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import Link from "next/link";
import { useState } from "react";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DateDisplay } from "@/components/accounting/common/DateDisplay";
import { StatusBadge } from "@/components/accounting/common/StatusBadge";
import {
  EMPTY_PAYMENT_ACCOUNT,
  formatCurrencyAmount,
  isPaymentAccountComplete,
  parseExchangeRate,
  PaymentAccountFields,
  PaymentAccountValue,
} from "@/components/accounting/common/PaymentAccountFields";
import {
  PdfUploadField,
  UploadedPdf,
} from "@/components/accounting/common/PdfUploadField";
import {
  DepositBalance,
  DepositMovement,
  useSaveDepositMovement,
  useSecurityDeposits,
  useVendorDeposit,
  VendorDepositDetail,
} from "@/lib/hooks/useSecurityDeposits";

const today = () => new Date().toLocaleDateString("en-CA");

const COLUMNS: { key: keyof DepositBalance; label: string; hint: string }[] = [
  {
    key: "pending",
    label: "Pending",
    hint: "On Hardware Purchase invoices not paid yet",
  },
  {
    key: "paid",
    label: "Paid",
    hint: "On Hardware Purchase invoices already paid",
  },
  { key: "returned", label: "Returned", hint: "Paid back to us in cash" },
  {
    key: "adjusted",
    label: "Adjusted",
    hint: "Applied by the vendor to its invoices",
  },
  {
    key: "held",
    label: "Held",
    hint: "Paid − Returned − Adjusted: what the vendor holds now",
  },
  {
    key: "outstanding",
    label: "Outstanding",
    hint: "Held + Pending (the admin panel card)",
  },
];

function TotalsRow({ totals }: { totals: DepositBalance }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr 1fr",
          sm: "repeat(3, 1fr)",
          md: "repeat(6, 1fr)",
        },
        gap: 2,
        mb: 3,
      }}
    >
      {COLUMNS.map((c) => (
        <Paper key={c.key} variant="outlined" sx={{ p: 2 }}>
          <Tooltip title={c.hint}>
            <Typography variant="body2" color="text.secondary">
              {c.label}
            </Typography>
          </Tooltip>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            <CurrencyDisplay value={totals[c.key]} />
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Record Return
// ---------------------------------------------------------------------------

function ReturnDialog({
  open,
  detail,
  onClose,
}: {
  open: boolean;
  detail: VendorDepositDetail;
  onClose: () => void;
}) {
  const save = useSaveDepositMovement();
  const [date, setDate] = useState(today());
  const [account, setAccount] = useState<PaymentAccountValue>(
    EMPTY_PAYMENT_ACCOUNT,
  );
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("0");
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<UploadedPdf | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rate = parseExchangeRate(account);
  const amountNum = Number(amount);
  const amountOk =
    amount.trim() !== "" && Number.isFinite(amountNum) && amountNum > 0;
  const usd = rate && amountOk ? amountNum / rate : 0;
  const held = detail.balance.held;
  const overHeld = usd > held + 0.005;
  const feeNum = Number(fee);
  const feeOk = fee.trim() !== "" && Number.isFinite(feeNum) && feeNum >= 0;

  const canSave =
    !!date &&
    isPaymentAccountComplete(account) &&
    amountOk &&
    feeOk &&
    !overHeld &&
    !!receipt &&
    !uploading &&
    !save.isPending;

  const handleSave = async () => {
    if (!canSave || !receipt) return;
    setError(null);
    try {
      await save.mutateAsync({
        data: {
          type: "RETURN",
          vendorId: detail.vendor.id,
          date,
          entityId: account.entityId,
          bankId: account.bankId,
          currencyId: account.currencyId,
          exchangeRate: account.exchangeRate.trim(),
          amount: amount.trim(),
          transactionFee: fee.trim(),
          receiptKey: receipt.key,
          note,
        },
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record the return");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Record deposit return — {detail.vendor.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Alert severity="info">
            {detail.vendor.name} holds{" "}
            <strong>
              <CurrencyDisplay value={held} />
            </strong>{" "}
            of deposit.
          </Alert>
          <TextField
            label="Date received"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <PaymentAccountFields
            value={account}
            onChange={setAccount}
            disabled={save.isPending}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label={`Amount received${account.currencyCode ? ` (${account.currencyCode})` : ""}`}
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              fullWidth
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
            />
            <TextField
              label={`Transaction fee${account.currencyCode ? ` (${account.currencyCode})` : ""}`}
              type="number"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              required
              fullWidth
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
            />
          </Stack>
          {usd > 0 && (
            <Typography color={overHeld ? "error" : "text.secondary"}>
              USD equivalent: <CurrencyDisplay value={usd} />
              {overHeld && " — more than the vendor holds"}
            </Typography>
          )}
          <TextField
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
          <PdfUploadField
            label="Return Receipt PDF"
            purpose="vendor-deposit-return-receipt"
            value={receipt}
            onChange={setReceipt}
            onUploadingChange={setUploading}
            required
            disabled={save.isPending}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>
          {save.isPending ? "Saving..." : "Record return"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Record Adjustment
// ---------------------------------------------------------------------------

function AdjustmentDialog({
  open,
  detail,
  onClose,
}: {
  open: boolean;
  detail: VendorDepositDetail;
  onClose: () => void;
}) {
  const save = useSaveDepositMovement();
  const [invoiceKey, setInvoiceKey] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invoice = detail.adjustableInvoices.find(
    (i) => `${i.kind}:${i.id}` === invoiceKey,
  );
  const held = detail.balance.held;
  const max = invoice ? Math.min(held, invoice.remaining) : held;
  const amountNum = Number(amount);
  const amountOk =
    /^\d+(\.\d{1,2})?$/.test(amount.trim()) &&
    amountNum > 0 &&
    amountNum <= max + 0.005;
  const coversInvoice =
    !!invoice && amountOk && Math.abs(invoice.remaining - amountNum) < 0.005;
  const canSave = !!invoice && amountOk && !!date && !save.isPending;

  const handleSave = async () => {
    if (!canSave || !invoice) return;
    setError(null);
    try {
      await save.mutateAsync({
        data: {
          type: "ADJUSTMENT",
          vendorId: detail.vendor.id,
          invoiceKind: invoice.kind,
          invoiceId: invoice.id,
          amountUsd: amount.trim(),
          date,
          note,
        },
      });
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to record the adjustment",
      );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Record deposit adjustment — {detail.vendor.name}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <DialogContentText>
            Use this when {detail.vendor.name} takes part of the deposit it
            holds (<CurrencyDisplay value={held} />) as payment for one of its
            Pending invoices. That invoice&apos;s cash due goes down by the same
            amount.
          </DialogContentText>
          {detail.adjustableInvoices.length === 0 ? (
            <Alert severity="warning">
              {detail.vendor.name} has no Pending Farm Tariff or Hardware
              Purchase invoices. Set the vendor on the invoice first if it is
              missing.
            </Alert>
          ) : (
            <TextField
              select
              label="Invoice"
              value={invoiceKey}
              onChange={(e) => setInvoiceKey(e.target.value)}
              required
              fullWidth
            >
              {detail.adjustableInvoices.map((i) => (
                <MenuItem key={`${i.kind}:${i.id}`} value={`${i.kind}:${i.id}`}>
                  {i.kind === "farm" ? "Farm Tariff" : "Hardware Purchase"}{" "}
                  {i.invoiceNumber} — ${i.remaining.toFixed(2)} still due
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            label="Amount (USD)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            fullWidth
            error={amount.trim() !== "" && !amountOk}
            helperText={`Up to $${max.toFixed(2)}`}
            slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
          />
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
          {coversInvoice && (
            <Alert severity="info">
              This covers the rest of the invoice, so it will be marked Paid on
              this date with no cash payment.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>
          {save.isPending ? "Saving..." : "Record adjustment"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Vendor detail
// ---------------------------------------------------------------------------

function invoiceLink(m: DepositMovement) {
  if (m.vendorInvoice) {
    return {
      href: `/accounting/vendorInvoice/${m.vendorInvoice.id}`,
      label: `Farm Tariff ${m.vendorInvoice.invoiceNumber}`,
      paid: m.vendorInvoice.paymentStatus !== "Pending",
    };
  }
  if (m.hardwarePurchase) {
    return {
      href: `/accounting/hardwarePurchase/${m.hardwarePurchase.id}`,
      label: `Hardware Purchase ${m.hardwarePurchase.invoiceNumber}`,
      paid: m.hardwarePurchase.paymentStatus !== "Pending",
    };
  }
  return null;
}

function VendorDetail({ vendorId }: { vendorId: string }) {
  const { data: detail, isLoading, error } = useVendorDeposit(vendorId);
  const remove = useSaveDepositMovement();
  const [dialog, setDialog] = useState<"return" | "adjustment" | null>(null);
  const [deleting, setDeleting] = useState<DepositMovement | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error || !detail) {
    return (
      <Alert severity="error">
        {error?.message ?? "Failed to load vendor"}
      </Alert>
    );
  }

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync({ id: deleting.id });
      setDeleting(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const noHeld = detail.balance.held <= 0;

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        spacing={2}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {detail.vendor.name}
          {!detail.vendor.isActive && (
            <Chip label="Inactive" size="small" sx={{ ml: 1 }} />
          )}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Tooltip title={noHeld ? "The vendor holds no deposit" : ""}>
            <span>
              <Button
                variant="outlined"
                onClick={() => setDialog("return")}
                disabled={noHeld}
              >
                Record return
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={noHeld ? "The vendor holds no deposit" : ""}>
            <span>
              <Button
                variant="contained"
                onClick={() => setDialog("adjustment")}
                disabled={noHeld}
              >
                Record adjustment
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      <TotalsRow totals={detail.balance} />

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Deposits on Hardware Purchases
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Invoice</TableCell>
                <TableCell>Hardware</TableCell>
                <TableCell>Issued</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Deposit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detail.depositInvoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    <Typography color="text.secondary">
                      No invoices with a deposit
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {detail.depositInvoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Link
                      href={`/accounting/hardwarePurchase/${i.id}`}
                      style={{ color: "#1976d2", textDecoration: "none" }}
                    >
                      {i.invoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{i.hardwareDescription}</TableCell>
                  <TableCell>
                    <DateDisplay date={new Date(i.billingDate)} format="date" />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={i.paymentStatus} size="small" />
                  </TableCell>
                  <TableCell align="right">
                    <CurrencyDisplay value={i.securityDeposit} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Returns and adjustments
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Details</TableCell>
                <TableCell align="right">Amount (USD)</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detail.movements.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    <Typography color="text.secondary">
                      Nothing returned or adjusted yet
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {detail.movements.map((m) => {
                const link = invoiceLink(m);
                const locked = m.type === "ADJUSTMENT" && !!link?.paid;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <DateDisplay date={new Date(m.date)} format="date" />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={m.type === "RETURN" ? "Return" : "Adjustment"}
                        color={m.type === "RETURN" ? "success" : "info"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {m.type === "RETURN" ? (
                        <Stack spacing={0.25}>
                          <Typography variant="body2">
                            {m.entity?.name} · {m.bank?.name}
                          </Typography>
                          {m.currency && m.amount && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {formatCurrencyAmount(m.amount, m.currency.code)}
                              {m.currency.code !== "USD" &&
                                ` at 1 USD = ${Number(m.exchangeRate)} ${m.currency.code}`}
                              {m.transactionFee &&
                                Number(m.transactionFee) > 0 &&
                                ` · fee ${formatCurrencyAmount(m.transactionFee, m.currency.code)}`}
                            </Typography>
                          )}
                          {m.receiptKey && (
                            <MuiLink
                              href={`/api/accounting/deposit-movements/${m.id}/receipt`}
                              target="_blank"
                              rel="noopener noreferrer"
                              variant="caption"
                              sx={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 0.5,
                              }}
                            >
                              <PictureAsPdfIcon sx={{ fontSize: 14 }} /> Receipt
                            </MuiLink>
                          )}
                        </Stack>
                      ) : link ? (
                        <Link
                          href={link.href}
                          style={{ color: "#1976d2", textDecoration: "none" }}
                        >
                          {link.label}
                        </Link>
                      ) : null}
                      {m.note && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block" }}
                        >
                          {m.note}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <CurrencyDisplay value={m.amountUsd} />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip
                        title={
                          locked
                            ? "Its invoice is paid, so this can't be deleted"
                            : "Delete"
                        }
                      >
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleting(m);
                            }}
                            disabled={locked || remove.isPending}
                          >
                            <DeleteIcon fontSize="small" color="error" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {dialog === "return" && (
        <ReturnDialog open detail={detail} onClose={() => setDialog(null)} />
      )}
      {dialog === "adjustment" && (
        <AdjustmentDialog
          open
          detail={detail}
          onClose={() => setDialog(null)}
        />
      )}

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          Delete this {deleting?.type === "RETURN" ? "return" : "adjustment"}?
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>
              The <CurrencyDisplay value={deleting?.amountUsd ?? 0} /> goes back
              to the deposit {detail.vendor.name} holds.
              {deleting?.type === "RETURN" &&
                " Its receipt PDF is deleted too."}{" "}
              This can&apos;t be undone.
            </DialogContentText>
            {deleteError && <Alert severity="error">{deleteError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SecurityDepositsPage() {
  const { data, isLoading, error } = useSecurityDeposits();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: "bold" }}>
          Security Deposits
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Deposits paid to vendors on Hardware Purchase invoices, and what the
          vendors have returned or applied to their invoices since. Select a
          vendor to see its invoices and record a return or adjustment.
        </Typography>
      </Box>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : error || !data ? (
        <Alert severity="error">
          {error?.message ?? "Failed to load security deposits"}
        </Alert>
      ) : (
        <>
          <TotalsRow totals={data.totals} />

          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold" }}>Vendor</TableCell>
                  {COLUMNS.map((c) => (
                    <TableCell
                      key={c.key}
                      align="right"
                      sx={{ fontWeight: "bold" }}
                    >
                      <Tooltip title={c.hint}>
                        <span>{c.label}</span>
                      </Tooltip>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.vendors.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        No security deposits recorded yet. Add one on a Hardware
                        Purchase invoice.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {data.vendors.map((v) => (
                  <TableRow
                    key={v.id}
                    hover
                    selected={selected === v.id}
                    onClick={() => setSelected(v.id)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>
                      {v.name}
                      {!v.isActive && " (inactive)"}
                    </TableCell>
                    {COLUMNS.map((c) => (
                      <TableCell
                        key={c.key}
                        align="right"
                        sx={
                          c.key === "outstanding"
                            ? { fontWeight: 600 }
                            : undefined
                        }
                      >
                        <CurrencyDisplay value={v[c.key]} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {selected && (
            <Paper sx={{ p: { xs: 2, sm: 3 } }}>
              <VendorDetail key={selected} vendorId={selected} />
            </Paper>
          )}
        </>
      )}
    </Container>
  );
}
