"use client";

/**
 * Add / Edit a Capital & Income entry: money received into one bank
 * (initial deposit, equity, loan, ...). Date, Head, Entity → Bank →
 * Currency → Rate, the amount received and the bank's fee (both in the
 * bank's currency), Received from, Narration, an optional PDF and an
 * optional Excel sheet. The amount is a Debit on the bank; the fee is its
 * own Credit row. The server re-checks everything.
 */

import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
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
  bankPaymentAccount,
  formatCurrencyAmount,
  parseExchangeRate,
  PaymentAccountFields,
  PaymentAccountValue,
} from "@/components/accounting/common/PaymentAccountFields";
import {
  PdfUploadField,
  UploadedPdf,
} from "@/components/accounting/common/PdfUploadField";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import {
  AccountingBank,
  useAccountingBanks,
  useIncomeHeads,
} from "@/lib/hooks/usePaymentAccounts";
import { IncomeEntry, useSaveIncome } from "@/lib/hooks/useCapitalIncome";

const USD = "USD";
const today = () => new Date().toLocaleDateString("en-CA");
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Up to 2 decimals; > 0, or >= 0 with allowZero. */
const money = (v: string, allowZero = false) => {
  if (!/^\s*\d+(\.\d{1,2})?\s*$/.test(v)) return null;
  const n = Number(v);
  return allowZero ? n : n > 0 ? n : null;
};
const zeroBlank = (v: string) => (Number(v) === 0 ? "" : v);

export function IncomeDialog({
  entry,
  defaultBank,
  onClose,
}: {
  /** Edit this entry; absent = add a new one. */
  entry?: IncomeEntry;
  /** New entry: pre-fill the receiving bank (from its statement page). */
  defaultBank?: AccountingBank;
  onClose: () => void;
}) {
  const save = useSaveIncome();
  const { data: banks = [] } = useAccountingBanks(true);
  const { data: heads = [], isLoading: headsLoading } = useIncomeHeads(true);
  // Editing keeps a head that has since been deactivated.
  const headOptions =
    entry && !heads.some((h) => h.id === entry.head.id)
      ? [...heads, { ...entry.head, _count: { entries: 0 } }]
      : heads;

  const [date, setDate] = useState(entry?.date ?? today());
  const [headId, setHeadId] = useState(entry?.head.id ?? "");
  const [account, setAccount] = useState<PaymentAccountValue>(
    entry
      ? {
          entityId: entry.entityId,
          bankId: entry.bankId,
          currencyId: entry.currencyId,
          currencyCode: entry.currencyCode,
          exchangeRate: entry.exchangeRate,
        }
      : bankPaymentAccount(defaultBank),
  );
  const [amount, setAmount] = useState(entry?.amount ?? "");
  const [fee, setFee] = useState(zeroBlank(entry?.fee ?? ""));
  const [receivedFrom, setReceivedFrom] = useState(entry?.receivedFrom ?? "");
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

  const code = account.currencyCode;
  const rate = parseExchangeRate(account);
  const amountNum = money(amount);
  const feeNum = fee.trim() === "" ? 0 : money(fee, true);

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
    !!headId &&
    !!account.entityId &&
    !!account.bankId &&
    !!account.currencyId &&
    !!rate &&
    amountNum !== null &&
    feeNum !== null &&
    amountUsd !== null &&
    amountUsd > 0 &&
    !uploadingPdf &&
    !uploadingSheet &&
    !save.isPending;

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    try {
      await save.mutateAsync({
        id: entry?.id,
        method: entry ? "PUT" : "POST",
        data: {
          date,
          headId,
          entityId: account.entityId,
          bankId: account.bankId,
          currencyId: account.currencyId,
          exchangeRate: account.exchangeRate.trim(),
          amount: amount.trim(),
          fee: fee.trim(),
          receivedFrom,
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
        {entry ? `Edit ${entry.entryLabel}` : "Add Capital & Income"}
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          Money received into one of our banks, e.g. an initial deposit, equity
          or a loan. It is a Debit on that bank&apos;s statement.
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
            helperText={dateError ?? "The day the money reached the bank"}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { max: maxDate },
            }}
          />
          <FormControl fullWidth required disabled={headsLoading}>
            <InputLabel>Head</InputLabel>
            <Select
              label="Head"
              value={headId}
              onChange={(e) => setHeadId(e.target.value)}
            >
              {headOptions.map((h) => (
                <MenuItem key={h.id} value={h.id}>
                  {h.name}
                  {h.isActive ? "" : " (inactive)"}
                </MenuItem>
              ))}
            </Select>
            {!headsLoading && headOptions.length === 0 && (
              <FormHelperText>
                No active heads. Add one under Capital &amp; Income → Heads.
              </FormHelperText>
            )}
          </FormControl>
          <PaymentAccountFields
            value={account}
            onChange={setAccount}
            disabled={save.isPending}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Amount received"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              fullWidth
              helperText={
                amountUsd !== null && code && code !== USD
                  ? `≈ $${amountUsd.toFixed(2)}`
                  : "In the bank's currency, before the fee"
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
                    : "Optional, charged by the bank"
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
                  Amount received − fee
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
            label="Received from"
            value={receivedFrom}
            onChange={(e) => setReceivedFrom(e.target.value)}
            fullWidth
            helperText="Optional: the shareholder, lender or other source. The statement shows the head when blank"
          />
          <TextField
            label="Narration"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            helperText="Optional: what the money is for, bank reference"
          />
          <PdfUploadField
            label="PDF (optional)"
            purpose="income-attachment"
            value={pdf}
            onChange={setPdf}
            onUploadingChange={setUploadingPdf}
            disabled={save.isPending}
          />
          <PdfUploadField
            label="Excel sheet (optional)"
            fileKind="sheet"
            purpose="income-sheet"
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
