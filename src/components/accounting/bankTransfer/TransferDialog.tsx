"use client";

/**
 * Record / Edit internal bank transfer. The sending side, then the
 * receiving side, then the rates. Rules (lib/accounting/bankTransfer.ts):
 * the bank's conversion rate is the only rate between the sides (received =
 * sent × rate), each side may have its own fee in its own currency, and
 * both sides carry one USD value: from the USD side, or sent ÷ the USD rate
 * when neither side is USD. The server re-checks everything.
 */

import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import {
  EMPTY_PAYMENT_ACCOUNT,
  formatCurrencyAmount,
  PaymentAccountFields,
  PaymentAccountValue,
} from "@/components/accounting/common/PaymentAccountFields";
import {
  PdfUploadField,
  UploadedPdf,
} from "@/components/accounting/common/PdfUploadField";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import { DaylightStatusPill } from "@/components/daylight/AdminPage";
import {
  AccountingBank,
  BankTransfer,
  useAccountingBanks,
  useAccountingEntities,
  useSaveBankTransfer,
} from "@/lib/hooks/usePaymentAccounts";

const USD = "USD";
const today = () => new Date().toLocaleDateString("en-CA");

/** A positive number typed in a field, or null. */
const positive = (v: string) => {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
};
/** A fee: blank = 0; null when invalid. */
const nonNegative = (v: string) => {
  if (v.trim() === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
/** A rate as typed text: up to 8 decimals, no trailing zeros. */
const rateText = (n: number) => String(Number(n.toFixed(8)));

const sideAccount = (s: BankTransfer["from"]): PaymentAccountValue => ({
  entityId: s.entityId,
  bankId: s.bankId,
  currencyId: s.currencyId,
  currencyCode: s.currencyCode,
  exchangeRate: "",
});

/** The From side pre-filled with a bank (and its currency if it has one). */
function bankAccount(bank: AccountingBank | undefined): PaymentAccountValue {
  if (!bank) return EMPTY_PAYMENT_ACCOUNT;
  const currencies = bank.currencies.filter((c) => c.currency.isActive);
  const only = currencies.length === 1 ? currencies[0].currency : null;
  return {
    ...EMPTY_PAYMENT_ACCOUNT,
    entityId: bank.entityId,
    bankId: bank.id,
    currencyId: only?.id ?? "",
    currencyCode: only?.code ?? "",
  };
}

const zeroBlank = (v: string) => (Number(v) === 0 ? "" : v);

export function TransferDialog({
  transfer,
  defaultFromBank,
  onClose,
}: {
  /** Edit this transfer; absent = record a new one. */
  transfer?: BankTransfer;
  /** New transfer: pre-fill the sending bank. */
  defaultFromBank?: AccountingBank;
  onClose: () => void;
}) {
  const save = useSaveBankTransfer();
  const { data: entities = [] } = useAccountingEntities(true);
  const { data: banks = [] } = useAccountingBanks(true);

  const [date, setDate] = useState(transfer?.date ?? today());
  const [from, setFrom] = useState<PaymentAccountValue>(
    transfer ? sideAccount(transfer.from) : bankAccount(defaultFromBank),
  );
  const [to, setTo] = useState<PaymentAccountValue>(
    transfer ? sideAccount(transfer.to) : EMPTY_PAYMENT_ACCOUNT,
  );
  const [fromAmount, setFromAmount] = useState(transfer?.from.amount ?? "");
  const [fromFee, setFromFee] = useState(zeroBlank(transfer?.from.fee ?? ""));
  const [rate, setRate] = useState(
    transfer && transfer.from.currencyCode !== transfer.to.currencyCode
      ? transfer.conversionRate
      : "",
  );
  const [toAmount, setToAmount] = useState(transfer?.to.amount ?? "");
  const [toFee, setToFee] = useState(zeroBlank(transfer?.to.fee ?? ""));
  const [usdRate, setUsdRate] = useState(
    transfer &&
      transfer.from.currencyCode !== USD &&
      transfer.to.currencyCode !== USD
      ? transfer.from.exchangeRate
      : "",
  );
  const [reference, setReference] = useState(transfer?.reference ?? "");
  const [note, setNote] = useState(transfer?.note ?? "");
  const [receipt, setReceipt] = useState<UploadedPdf | null>(
    transfer?.receiptKey
      ? { key: transfer.receiptKey, fileName: "Saved receipt" }
      : null,
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromCode = from.currencyCode;
  const toCode = to.currencyCode;
  const bothCurrencies = !!fromCode && !!toCode;
  const sameCurrency = bothCurrencies && fromCode === toCode;
  const needsRate = bothCurrencies && !sameCurrency;
  const needsUsdRate = bothCurrencies && fromCode !== USD && toCode !== USD;
  const sameAccount =
    !!from.bankId && from.bankId === to.bankId && fromCode === toCode;

  const sent = positive(fromAmount);
  const rateNum = needsRate ? positive(rate) : 1;
  const received = positive(toAmount);
  const feeOut = nonNegative(fromFee);
  const feeIn = nonNegative(toFee);
  const usdRateNum = needsUsdRate ? positive(usdRate) : 1;

  // Received follows sent × rate; typing received works the rate out.
  const recalcReceived = (
    sentText: string,
    rateText_: string,
    same: boolean,
  ) => {
    const s = positive(sentText);
    const r = same ? 1 : positive(rateText_);
    if (s && r) setToAmount(round2(s * r).toFixed(2));
  };
  const onFromAmount = (v: string) => {
    setFromAmount(v);
    recalcReceived(v, rate, sameCurrency);
  };
  const onRate = (v: string) => {
    setRate(v);
    recalcReceived(fromAmount, v, false);
  };
  const onToAmount = (v: string) => {
    setToAmount(v);
    const r = positive(v);
    if (sent && r && needsRate) setRate(rateText(r / sent));
  };
  const onToAccount = (v: PaymentAccountValue) => {
    setTo(v);
    if (v.currencyCode && v.currencyCode === fromCode) {
      setRate("");
      if (sent) setToAmount(sent.toFixed(2));
    }
  };
  const onFromAccount = (v: PaymentAccountValue) => {
    setFrom(v);
    if (v.currencyCode && v.currencyCode === toCode) {
      setRate("");
      if (sent) setToAmount(sent.toFixed(2));
    }
  };

  // One USD value for both sides (mirrors bankTransfer.ts).
  const amountUsd =
    !bothCurrencies || !sent || !received
      ? null
      : fromCode === USD
        ? sent
        : toCode === USD
          ? received
          : usdRateNum
            ? round2(sent / usdRateNum)
            : null;
  const feeOutUsd =
    amountUsd && sent && feeOut !== null
      ? round2((feeOut * amountUsd) / sent)
      : 0;
  const feeInUsd =
    amountUsd && received && feeIn !== null
      ? round2((feeIn * amountUsd) / received)
      : 0;

  const entityName = (id: string) => entities.find((e) => e.id === id)?.name;
  const bankName = (id: string) => banks.find((b) => b.id === id)?.name;
  const fromBankName = bankName(from.bankId) ?? "sending bank";
  const toBankName = bankName(to.bankId) ?? "receiving bank";
  // What leaves the sending bank: amount sent + its fee.
  const totalDeducted = sent ? sent + (feeOut ?? 0) : null;
  const interCompany =
    !!from.entityId && !!to.entityId && from.entityId !== to.entityId;

  const canSave =
    !!date &&
    !!from.bankId &&
    !!from.currencyId &&
    !!to.bankId &&
    !!to.currencyId &&
    !sameAccount &&
    !!sent &&
    !!received &&
    feeOut !== null &&
    feeIn !== null &&
    !!rateNum &&
    !!usdRateNum &&
    !!amountUsd &&
    !uploading &&
    !save.isPending;

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    try {
      await save.mutateAsync({
        id: transfer?.id,
        method: transfer ? "PUT" : "POST",
        data: {
          date,
          from: {
            entityId: from.entityId,
            bankId: from.bankId,
            currencyId: from.currencyId,
            amount: fromAmount.trim(),
            fee: fromFee.trim(),
          },
          to: {
            entityId: to.entityId,
            bankId: to.bankId,
            currencyId: to.currencyId,
            amount: toAmount.trim(),
            fee: toFee.trim(),
          },
          conversionRate: needsRate ? rate.trim() : "",
          fromUsdRate: needsUsdRate ? usdRate.trim() : "",
          reference,
          note,
          receiptKey: receipt?.key ?? null,
        },
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save the transfer");
    }
  };

  const money = (code: string) =>
    code
      ? {
          input: {
            endAdornment: (
              <InputAdornment position="end">{code}</InputAdornment>
            ),
          },
          htmlInput: { min: 0, step: 0.01 },
        }
      : { htmlInput: { min: 0, step: 0.01 } };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {transfer ? "Edit internal transfer" : "Record internal transfer"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
            From (sending bank)
          </Typography>
          <PaymentAccountFields
            value={from}
            onChange={onFromAccount}
            disabled={save.isPending}
            showRate={false}
            labelPrefix="From"
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Amount sent"
              type="number"
              value={fromAmount}
              onChange={(e) => onFromAmount(e.target.value)}
              required
              fullWidth
              helperText="Without the fee"
              slotProps={money(fromCode)}
            />
            <TextField
              label="Sending bank fee"
              type="number"
              value={fromFee}
              onChange={(e) => setFromFee(e.target.value)}
              fullWidth
              helperText="Optional, charged by this bank"
              slotProps={money(fromCode)}
            />
          </Stack>
          {totalDeducted !== null && feeOut !== null && (
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
                rowGap: 0.5,
              }}
            >
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 650 }}>
                  Total deducted from {fromBankName}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                  Amount sent + sending bank fee
                </Typography>
              </Box>
              <Box
                sx={{
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
                  {fromCode
                    ? formatCurrencyAmount(totalDeducted, fromCode)
                    : totalDeducted.toFixed(2)}
                </Typography>
                {amountUsd !== null && fromCode !== USD && (
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                    ≈ <CurrencyDisplay value={amountUsd + feeOutUsd} />
                  </Typography>
                )}
              </Box>
            </Box>
          )}

          <Divider />
          <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
            To (receiving bank)
          </Typography>
          <PaymentAccountFields
            value={to}
            onChange={onToAccount}
            disabled={save.isPending}
            showRate={false}
            labelPrefix="To"
          />
          {sameAccount && (
            <Alert severity="warning">
              Pick a different bank, or a different currency of the same bank.
            </Alert>
          )}
          {needsRate && (
            <TextField
              label="Bank conversion rate"
              type="number"
              value={rate}
              onChange={(e) => onRate(e.target.value)}
              required
              fullWidth
              helperText="The rate the bank gave for this transfer"
              slotProps={{
                htmlInput: { min: 0, step: "any" },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      1 {fromCode} =
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">{toCode}</InputAdornment>
                  ),
                },
              }}
            />
          )}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Amount received"
              type="number"
              value={toAmount}
              onChange={(e) => onToAmount(e.target.value)}
              required
              fullWidth
              disabled={sameCurrency}
              helperText={
                sameCurrency
                  ? "Same currency: equals the amount sent"
                  : "Sent × rate. Typing it works the rate out"
              }
              slotProps={money(toCode)}
            />
            <TextField
              label="Receiving bank fee"
              type="number"
              value={toFee}
              onChange={(e) => setToFee(e.target.value)}
              fullWidth
              helperText="Optional, charged by this bank"
              slotProps={money(toCode)}
            />
          </Stack>
          {needsUsdRate && (
            <TextField
              label="USD rate"
              type="number"
              value={usdRate}
              onChange={(e) => setUsdRate(e.target.value)}
              required
              fullWidth
              helperText="Neither side is USD: how many units of the sending currency equal 1 USD"
              slotProps={{
                htmlInput: { min: 0, step: "any" },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">1 USD =</InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">{fromCode}</InputAdornment>
                  ),
                },
              }}
            />
          )}

          {amountUsd && sent && received && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: "action.hover",
                fontSize: 13,
              }}
            >
              <Stack spacing={0.5}>
                {interCompany && (
                  <Box>
                    <DaylightStatusPill label="Inter-company" tone="warning" />{" "}
                    {entityName(from.entityId)} → {entityName(to.entityId)}
                  </Box>
                )}
                <Box>
                  Deducted from {fromBankName}:{" "}
                  <strong>
                    {formatCurrencyAmount(sent + (feeOut ?? 0), fromCode)}
                  </strong>{" "}
                  (<CurrencyDisplay value={amountUsd + feeOutUsd} />)
                </Box>
                <Box>
                  Added to {toBankName}:{" "}
                  <strong>
                    {formatCurrencyAmount(received - (feeIn ?? 0), toCode)}
                  </strong>{" "}
                  (<CurrencyDisplay value={amountUsd - feeInUsd} />)
                  {(feeIn ?? 0) > 0 && " after its fee"}
                </Box>
                <Box sx={{ color: "text.secondary", fontSize: 12 }}>
                  Transfer value <CurrencyDisplay value={amountUsd} /> on both
                  statements
                  {feeOutUsd + feeInUsd > 0 && (
                    <>
                      , plus fees of{" "}
                      <CurrencyDisplay value={feeOutUsd + feeInUsd} /> as
                      separate rows
                    </>
                  )}
                  .
                </Box>
              </Stack>
            </Box>
          )}

          <Divider />
          <TextField
            label="Reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            fullWidth
            helperText="Optional: bank reference or transaction id"
          />
          <TextField
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
          <PdfUploadField
            label="Transfer Receipt PDF (optional)"
            purpose="bank-transfer-receipt"
            value={receipt}
            onChange={setReceipt}
            onUploadingChange={setUploading}
            disabled={save.isPending}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>
          {save.isPending
            ? "Saving..."
            : transfer
              ? "Save changes"
              : "Record transfer"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
