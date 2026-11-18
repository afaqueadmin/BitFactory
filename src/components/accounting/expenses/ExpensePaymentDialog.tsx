"use client";

/**
 * Record / Edit an expense payment: Entity → Bank → Currency → Rate, then
 * the amount paid and the bank's fee, both in the bank's currency (decided
 * 2026-11-13). Shows the USD values, the new balance and the total deducted
 * from the bank. A payment above the remaining balance can't be saved; the
 * server re-checks it.
 */

import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ReactNode, useState } from "react";
import {
  EMPTY_PAYMENT_ACCOUNT,
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
import { dayLabel } from "@/components/accounting/bankStatement/StatementParts";
import { useAccountingBanks } from "@/lib/hooks/usePaymentAccounts";
import {
  Expense,
  ExpensePayment,
  useSaveExpensePayment,
} from "@/lib/hooks/useExpenses";

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

function Summary({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        justifyContent: "space-between",
        columnGap: 2,
      }}
    >
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{label}</Typography>
        {sub && (
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {sub}
          </Typography>
        )}
      </Box>
      <Box sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {children}
      </Box>
    </Box>
  );
}

export function ExpensePaymentDialog({
  expense,
  payment,
  onClose,
}: {
  expense: Expense;
  /** Edit this payment; absent = record a new one. */
  payment?: ExpensePayment;
  onClose: () => void;
}) {
  const save = useSaveExpensePayment();
  const { data: banks = [] } = useAccountingBanks(true);

  const [date, setDate] = useState(payment?.date ?? today());
  const [account, setAccount] = useState<PaymentAccountValue>(
    payment
      ? {
          entityId: payment.entityId,
          bankId: payment.bankId,
          currencyId: payment.currencyId,
          currencyCode: payment.currencyCode,
          exchangeRate: payment.exchangeRate,
        }
      : EMPTY_PAYMENT_ACCOUNT,
  );
  const [amount, setAmount] = useState(payment?.amount ?? "");
  const [fee, setFee] = useState(zeroBlank(payment?.fee ?? ""));
  const [note, setNote] = useState(payment?.note ?? "");
  const [receipt, setReceipt] = useState<UploadedPdf | null>(
    payment?.receiptKey
      ? { key: payment.receiptKey, fileName: "Saved receipt" }
      : null,
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const code = account.currencyCode;
  const rate = parseExchangeRate(account);
  const amountNum = money(amount);
  const feeNum = fee.trim() === "" ? 0 : money(fee, true);

  // USD values, as the server works them out (÷ rate, to cents).
  const amountUsd =
    amountNum !== null && rate ? round2(amountNum / rate) : null;
  const feeUsd = feeNum !== null && rate ? round2(feeNum / rate) : null;

  // What the expense still owes, leaving out the payment being edited.
  const due = Number(expense.amountDueUsd);
  const otherPaid = round2(
    Number(expense.paidUsd) - (payment ? Number(payment.amountUsd) : 0),
  );
  const remaining = round2(due - otherPaid);
  const overpaid = amountUsd !== null && amountUsd > remaining + 1e-9;
  const newBalance = amountUsd !== null ? round2(remaining - amountUsd) : null;
  const bankName =
    banks.find((b) => b.id === account.bankId)?.name ??
    (payment?.bankId === account.bankId ? payment?.bankName : undefined) ??
    "the bank";

  // On or after the expense's date, not after today (the server checks too).
  const maxDate = today();
  const dateError = !date
    ? null
    : date < expense.date
      ? `Can't be before the expense date (${dayLabel(expense.date)})`
      : date > maxDate
        ? "Can't be in the future"
        : null;

  const canSave =
    !!date &&
    !dateError &&
    !!account.entityId &&
    !!account.bankId &&
    !!account.currencyId &&
    !!rate &&
    amountNum !== null &&
    feeNum !== null &&
    amountUsd !== null &&
    amountUsd > 0 &&
    !overpaid &&
    !uploading &&
    !save.isPending;

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    try {
      await save.mutateAsync({
        expenseId: expense.id,
        id: payment?.id,
        method: payment ? "PUT" : "POST",
        data: {
          date,
          entityId: account.entityId,
          bankId: account.bankId,
          currencyId: account.currencyId,
          exchangeRate: account.exchangeRate.trim(),
          amount: amount.trim(),
          fee: fee.trim(),
          note,
          receiptKey: receipt?.key ?? null,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save the payment");
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
        {payment ? "Edit payment" : "Record payment"}
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          {expense.entryLabel} · {expense.head.name} · {expense.date} · due{" "}
          <CurrencyDisplay value={expense.amountDueUsd} /> · remaining{" "}
          <CurrencyDisplay value={remaining} />
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {payment && !payment.bankActive && (
            <Alert severity="warning">
              {payment.bankName} is now inactive. Pick an active bank to save
              changes.
            </Alert>
          )}
          <TextField
            label="Payment date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            fullWidth
            error={!!dateError}
            helperText={
              dateError ??
              `From the expense date (${dayLabel(expense.date)}) to today`
            }
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { min: expense.date, max: maxDate },
            }}
          />
          <PaymentAccountFields
            value={account}
            onChange={setAccount}
            disabled={save.isPending}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Amount paid"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              fullWidth
              error={overpaid}
              helperText={
                overpaid
                  ? "More than the remaining balance"
                  : amountUsd !== null && code && code !== USD
                    ? `≈ $${amountUsd.toFixed(2)}`
                    : "In the bank's currency, without the fee"
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
              }}
            >
              <Stack spacing={1}>
                <Summary
                  label={`Total deducted from ${bankName}`}
                  sub="Amount paid + fee"
                >
                  <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
                    {code
                      ? formatCurrencyAmount(amountNum + feeNum, code)
                      : (amountNum + feeNum).toFixed(2)}
                  </Typography>
                  {amountUsd !== null && feeUsd !== null && code !== USD && (
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                      ≈ <CurrencyDisplay value={amountUsd + feeUsd} />
                    </Typography>
                  )}
                </Summary>
                {newBalance !== null && (
                  <Summary
                    label="New balance"
                    sub="Remaining − amount paid (the fee doesn't count)"
                  >
                    <Typography
                      sx={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: overpaid ? "error.main" : undefined,
                      }}
                    >
                      <CurrencyDisplay value={newBalance} />
                    </Typography>
                  </Summary>
                )}
              </Stack>
            </Box>
          )}
          {overpaid && (
            <Alert severity="error">
              This payment is more than the remaining balance of $
              {remaining.toFixed(2)}.
            </Alert>
          )}

          <TextField
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            helperText="Optional: bank reference or anything else"
          />
          <PdfUploadField
            label="Payment receipt PDF (optional)"
            purpose="expense-payment-receipt"
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
            : payment
              ? "Save changes"
              : "Record payment"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
