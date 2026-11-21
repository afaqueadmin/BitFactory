"use client";

/**
 * Add / Edit a Bank Reconciliation entry: which bank received the money of
 * one PAID customer invoice that is on no bank statement. Date, Invoice
 * Type, Invoice Number (searchable), Client, Entity → Bank → Currency →
 * Rate, Amount (0 allowed) and Fee in the bank's currency, Narration, an
 * optional PDF and Excel sheet. Picking an invoice fills Client, Date (its
 * paid date) and Narration (its payment notes). The amount is a Debit on
 * the bank; the fee is its own Credit row. The server re-checks everything.
 */

import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import {
  formatCurrencyAmount,
  EMPTY_PAYMENT_ACCOUNT,
  parseExchangeRate,
  PaymentAccountFields,
  PaymentAccountValue,
} from "@/components/accounting/common/PaymentAccountFields";
import {
  PdfUploadField,
  UploadedPdf,
} from "@/components/accounting/common/PdfUploadField";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { useAccountingBanks } from "@/lib/hooks/usePaymentAccounts";
import {
  ReconciliationEntry,
  ReconciliationInvoice,
  useReconciliationInvoices,
  useSaveReconciliation,
} from "@/lib/hooks/useBankReconciliation";
import { RECONCILIATION_INVOICE_TYPES } from "@/lib/accounting/bankReconciliationLists";

const USD = "USD";
const today = () => new Date().toLocaleDateString("en-CA");
/** A saved instant as the viewer's calendar day (YYYY-MM-DD). */
const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA");
/** A saved instant as dd/mm/yyyy in the viewer's time zone. */
const dmy = (iso: string) => new Date(iso).toLocaleDateString("en-GB");
const round2 = (n: number) => Math.round(n * 100) / 100;
/** 0 or more, up to 2 decimals. */
const money = (v: string) =>
  /^\s*\d+(\.\d{1,2})?\s*$/.test(v) ? Number(v) : null;
const zeroBlank = (v: string) => (Number(v) === 0 ? "" : v);

export function ReconciliationDialog({
  entry,
  onClose,
}: {
  /** Edit this entry; absent = add a new one. */
  entry?: ReconciliationEntry;
  onClose: () => void;
}) {
  const save = useSaveReconciliation();
  const { data: banks = [] } = useAccountingBanks(true);

  const [date, setDate] = useState(entry?.date ?? "");
  const [invoiceType, setInvoiceType] = useState(entry?.invoiceType ?? "");
  const [invoice, setInvoice] = useState<ReconciliationInvoice | null>(
    entry
      ? {
          id: entry.invoiceId,
          invoiceNumber: entry.invoiceNumber,
          clientName: entry.clientName,
          totalUsd: entry.invoiceTotalUsd,
          paidDate: null,
          issuedDate: null,
          dueDate: "",
          markedPaid: null,
          narration: "",
        }
      : null,
  );
  const [account, setAccount] = useState<PaymentAccountValue>(
    entry
      ? {
          entityId: entry.entityId,
          bankId: entry.bankId,
          currencyId: entry.currencyId,
          currencyCode: entry.currencyCode,
          exchangeRate: entry.exchangeRate,
        }
      : EMPTY_PAYMENT_ACCOUNT,
  );
  const [amount, setAmount] = useState(entry?.amount ?? "");
  const [fee, setFee] = useState(zeroBlank(entry?.fee ?? ""));
  const [narration, setNarration] = useState(entry?.narration ?? "");
  const [pdf, setPdf] = useState<UploadedPdf | null>(
    entry?.pdf ? { key: entry.pdf.key, fileName: entry.pdf.fileName } : null,
  );
  const [sheet, setSheet] = useState<UploadedPdf | null>(
    entry?.sheet
      ? { key: entry.sheet.key, fileName: entry.sheet.fileName }
      : null,
  );
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingSheet, setUploadingSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing keeps the entry's own invoice in the list.
  const {
    data: invoices = [],
    isLoading: invoicesLoading,
    error: invoicesError,
  } = useReconciliationInvoices(
    invoiceType,
    entry && invoiceType === entry.invoiceType ? entry.invoiceId : undefined,
  );

  const pickType = (type: string) => {
    setInvoiceType(type);
    setInvoice(null);
  };

  // A picked invoice fills Client, Date (its paid date, if saved) and
  // Narration (its payment notes). All but Client stay editable.
  const pickInvoice = (inv: ReconciliationInvoice | null) => {
    setInvoice(inv);
    if (!inv) return;
    setDate(inv.paidDate ? localDay(inv.paidDate) : "");
    setNarration(inv.narration);
  };

  // The picked invoice as listed (an edit starts with a stub until loaded).
  const listed = invoice
    ? invoices.find((i) => i.id === invoice.id)
    : undefined;
  const noPaidDateHint =
    listed && !listed.paidDate
      ? [
          "This invoice was marked as paid with no payment date.",
          listed.issuedDate ? `Issued ${dmy(listed.issuedDate)}` : "Not issued",
          listed.dueDate ? `Due ${dmy(listed.dueDate)}` : null,
          listed.markedPaid
            ? `Marked as paid ${dmy(listed.markedPaid.at)} by ${listed.markedPaid.by}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  const code = account.currencyCode;
  const rate = parseExchangeRate(account);
  const amountNum = money(amount);
  const feeNum = fee.trim() === "" ? 0 : money(fee);

  // USD values, as the server works them out (÷ rate, to cents).
  const amountUsd =
    amountNum !== null && rate ? round2(amountNum / rate) : null;
  const feeUsd = feeNum !== null && rate ? round2(feeNum / rate) : null;
  const bankName =
    banks.find((b) => b.id === account.bankId)?.name ??
    (entry?.bankId === account.bankId ? entry?.bankName : undefined) ??
    "the bank";

  // Today or earlier (the server checks too).
  const maxDate = today();
  const dateError = date && date > maxDate ? "Can't be in the future" : null;

  const canSave =
    !!date &&
    !dateError &&
    !!invoiceType &&
    !!invoice &&
    !!account.entityId &&
    !!account.bankId &&
    !!account.currencyId &&
    !!rate &&
    amountNum !== null &&
    feeNum !== null &&
    !uploadingPdf &&
    !uploadingSheet &&
    !save.isPending;

  const handleSave = async () => {
    if (!canSave || !invoice) return;
    setError(null);
    try {
      await save.mutateAsync({
        id: entry?.id,
        method: entry ? "PUT" : "POST",
        data: {
          date,
          invoiceType,
          invoiceId: invoice.id,
          entityId: account.entityId,
          bankId: account.bankId,
          currencyId: account.currencyId,
          exchangeRate: account.exchangeRate.trim(),
          amount: amount.trim(),
          fee: fee.trim(),
          narration,
          pdf,
          sheet,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save the entry");
    }
  };

  const moneySlot = {
    htmlInput: { min: 0, step: 0.01 },
    ...(code
      ? {
          input: {
            endAdornment: (
              <InputAdornment position="end">{code}</InputAdornment>
            ),
          },
        }
      : {}),
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {entry ? `Edit ${entry.entryLabel}` : "Add Bank Reconciliation"}
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          Which bank received the money of a paid invoice that is on no bank
          statement. It is a Debit on that bank&apos;s statement; the invoice
          itself doesn&apos;t change.
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {entry && !entry.bankActive && (
            <Alert severity="warning">
              {entry.bankName} is now inactive. Pick an active bank to save
              changes.
            </Alert>
          )}
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            fullWidth
            error={!!dateError}
            helperText={
              dateError ??
              (invoice && !date
                ? "This invoice has no paid date saved: enter the day the money reached the bank"
                : "The day the money reached the bank (filled with the invoice's paid date)")
            }
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { max: maxDate },
            }}
          />
          <FormControl fullWidth required>
            <InputLabel>Invoice Type</InputLabel>
            <Select
              label="Invoice Type"
              value={invoiceType}
              onChange={(e) => pickType(e.target.value)}
            >
              {RECONCILIATION_INVOICE_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Autocomplete
            options={invoices}
            value={invoice}
            onChange={(_e, inv) => pickInvoice(inv)}
            disabled={!invoiceType}
            loading={invoicesLoading}
            getOptionLabel={(i) => i.invoiceNumber}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            // Search by invoice number or client.
            filterOptions={(options, { inputValue }) => {
              const q = inputValue.trim().toLowerCase();
              if (!q) return options;
              return options.filter((i) =>
                `${i.invoiceNumber} ${i.clientName}`.toLowerCase().includes(q),
              );
            }}
            noOptionsText="No paid invoices of this type are missing from the bank statements"
            renderOption={(props, i) => (
              <li {...props} key={i.id}>
                <Box sx={{ display: "flex", width: "100%", gap: 2 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>
                      {i.invoiceNumber}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {i.clientName}
                      {i.paidDate ? ` · paid ${localDay(i.paidDate)}` : ""}
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    <CurrencyDisplay value={i.totalUsd} />
                  </Typography>
                </Box>
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Invoice Number"
                required
                error={!!invoicesError}
                helperText={
                  invoicesError
                    ? invoicesError.message
                    : invoiceType
                      ? "Type to search by invoice number or client. Only paid invoices on no bank statement are listed"
                      : "Pick the invoice type first"
                }
              />
            )}
          />
          {noPaidDateHint && <Alert severity="info">{noPaidDateHint}</Alert>}
          <TextField
            label="Client"
            value={invoice?.clientName ?? ""}
            fullWidth
            helperText={
              invoice
                ? `Invoice total ${Number(invoice.totalUsd).toLocaleString("en-US", { style: "currency", currency: "USD" })}`
                : "Filled in from the invoice"
            }
            slotProps={{ input: { readOnly: true } }}
          />
          <PaymentAccountFields
            value={account}
            onChange={setAccount}
            disabled={save.isPending}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              fullWidth
              error={amount.trim() !== "" && amountNum === null}
              helperText={
                amount.trim() !== "" && amountNum === null
                  ? "0 or more, up to 2 decimals"
                  : amountUsd !== null && code && code !== USD
                    ? `≈ $${amountUsd.toFixed(2)}`
                    : "In the bank's currency, before the fee. 0 for an invoice marked as paid with no amount"
              }
              slotProps={moneySlot}
            />
            <TextField
              label="Fee / charges"
              type="number"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              fullWidth
              error={feeNum === null}
              helperText={
                feeNum === null
                  ? "0 or more, up to 2 decimals"
                  : feeUsd && code && code !== USD
                    ? `≈ $${feeUsd.toFixed(2)}`
                    : "Optional, charged by the bank: a separate Credit row"
              }
              slotProps={moneySlot}
            />
          </Stack>

          {amountNum !== null && feeNum !== null && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: "action.hover",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                justifyContent: "space-between",
                columnGap: 2,
              }}
            >
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 650 }}>
                  Total added to {bankName}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                  Amount − fee
                </Typography>
              </Box>
              <Box
                sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
              >
                <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
                  {code
                    ? formatCurrencyAmount(round2(amountNum - feeNum), code)
                    : round2(amountNum - feeNum).toFixed(2)}
                </Typography>
                {amountUsd !== null && feeUsd !== null && code !== USD && (
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                    ≈ <CurrencyDisplay value={round2(amountUsd - feeUsd)} />
                  </Typography>
                )}
              </Box>
            </Box>
          )}

          <TextField
            label="Narration"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            helperText="Filled with the invoice's payment notes; edit as needed (e.g. already pre paid)"
          />
          <PdfUploadField
            label="PDF (optional)"
            purpose="reconciliation-attachment"
            value={pdf}
            onChange={setPdf}
            onUploadingChange={setUploadingPdf}
            disabled={save.isPending}
          />
          <PdfUploadField
            label="Excel sheet (optional)"
            fileKind="sheet"
            purpose="reconciliation-sheet"
            value={sheet}
            onChange={setSheet}
            onUploadingChange={setUploadingSheet}
            disabled={save.isPending}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>
          {save.isPending ? "Saving..." : entry ? "Save changes" : "Add entry"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
