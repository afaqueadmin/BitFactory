"use client";

/**
 * The currency parts of a payment. A payment can be split across
 * currencies (e.g. 5 USD + 10 AED at 2 for a 10 USD invoice); each part has
 * its own Entity -> Bank -> Currency and rate (PaymentAccountFields), an
 * amount in that currency and, on vendor-side payments, a transaction fee.
 * Shows each part's USD value, the USD total and what is still to be
 * entered, in the last part's currency, so the admin can settle exactly.
 */

import {
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { CurrencyDisplay } from "@/components/accounting/common/CurrencyDisplay";
import {
  EMPTY_PAYMENT_ACCOUNT,
  PaymentAccountFields,
  PaymentAccountValue,
  conversionRate,
  formatCurrencyAmount,
  isPaymentAccountComplete,
  parseExchangeRate,
  usdToCurrency,
} from "@/components/accounting/common/PaymentAccountFields";

/** Mirrors MAX_PAYMENT_PARTS in lib/accounting/paymentAccount. */
export const MAX_PAYMENT_PARTS = 10;

/** Gaps under half a cent count as settled. */
const CENT_EPSILON = 0.005;

export interface PaymentPartValue extends PaymentAccountValue {
  /** Stable React key; never sent to the server. */
  key: string;
  /** In the part's currency, kept as typed text. */
  amount: string;
  /** In the part's currency, kept as typed text (vendor-side only). */
  transactionFee: string;
}

let nextKey = 0;
export const newPaymentPart = (): PaymentPartValue => ({
  ...EMPTY_PAYMENT_ACCOUNT,
  key: `part-${++nextKey}`,
  amount: "",
  transactionFee: "",
});

/** Typed amount as a number; blank or invalid counts as 0. */
const toNumber = (value: string) => {
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) ? n : 0;
};

/** The part's amount in USD at its rate (0 without a valid rate). */
export function partUsd(part: PaymentPartValue): number {
  const rate = parseExchangeRate(part);
  return rate ? toNumber(part.amount) / rate : 0;
}

/** Unrounded USD total of the parts. */
export const partsTotalUsd = (parts: PaymentPartValue[]) =>
  parts.reduce((sum, p) => sum + partUsd(p), 0);

/** Total of the typed amounts, in whatever currencies (for "> 0" checks). */
export const partsEnteredAmount = (parts: PaymentPartValue[]) =>
  parts.reduce((sum, p) => sum + toNumber(p.amount), 0);

/**
 * Account and rate chosen, amount > 0 (or blank/0 with allowZeroAmount),
 * and with withFee a fee of 0 or more.
 */
export function isPartComplete(
  part: PaymentPartValue,
  { allowZeroAmount = false, withFee = false } = {},
): boolean {
  if (!isPaymentAccountComplete(part)) return false;
  const amount = part.amount.trim() === "" ? null : Number(part.amount);
  const amountOk = allowZeroAmount
    ? amount === null || (Number.isFinite(amount) && amount >= 0)
    : amount !== null && Number.isFinite(amount) && amount > 0;
  if (!amountOk) return false;
  if (!withFee) return true;
  const fee =
    part.transactionFee.trim() === "" ? null : Number(part.transactionFee);
  return fee !== null && Number.isFinite(fee) && fee >= 0;
}

/** The parts as the record-payment endpoints expect them. */
export const partsPayload = (parts: PaymentPartValue[], withFee = false) =>
  parts.map((p) => ({
    entityId: p.entityId,
    bankId: p.bankId,
    currencyId: p.currencyId,
    exchangeRate: p.exchangeRate.trim(),
    amount: p.amount.trim(),
    ...(withFee ? { transactionFee: p.transactionFee.trim() } : {}),
  }));

interface PaymentPartsFieldsProps {
  parts: PaymentPartValue[];
  onChange: (parts: PaymentPartValue[]) => void;
  disabled?: boolean;
  /** Mark as Paid: amounts are cleared and locked, one part only. */
  amountsDisabled?: boolean;
  /** Vendor-side: a transaction fee per part. */
  withFee?: boolean;
  /** USD still due; drives the "Remaining" hint. Omit to hide it. */
  targetUsd?: number;
  /** e.g. "hardware sales payment"; used in the amount helper text. */
  amountLabel?: string;
}

export function PaymentPartsFields({
  parts,
  onChange,
  disabled = false,
  amountsDisabled = false,
  withFee = false,
  targetUsd,
  amountLabel = "payment",
}: PaymentPartsFieldsProps) {
  const update = (index: number, patch: Partial<PaymentPartValue>) =>
    onChange(parts.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const remove = (index: number) =>
    onChange(parts.filter((_, i) => i !== index));
  const add = () => onChange([...parts, newPaymentPart()]);

  const totalUsd = partsTotalUsd(parts);
  const remainingUsd = targetUsd !== undefined ? targetUsd - totalUsd : null;
  const multi = parts.length > 1;
  const last = parts[parts.length - 1];
  const lastRate = last ? conversionRate(last) : null;

  return (
    <Stack spacing={2}>
      {parts.map((part, index) => {
        const rate = parseExchangeRate(part);
        const code = part.currencyCode;
        const usd = partUsd(part);
        const currencyAdornment = code
          ? {
              input: {
                endAdornment: <Typography sx={{ ml: 1 }}>{code}</Typography>,
              },
            }
          : {};

        const body = (
          <Stack spacing={2}>
            <PaymentAccountFields
              value={part}
              onChange={(account) => update(index, account)}
              disabled={disabled}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                label={code ? `Amount Paid (${code})` : "Amount Paid"}
                type="number"
                value={part.amount}
                onChange={(e) => update(index, { amount: e.target.value })}
                required={!amountsDisabled}
                disabled={disabled || amountsDisabled || !rate}
                helperText={
                  amountsDisabled
                    ? "Not needed when marking as paid"
                    : !rate
                      ? "Choose the currency and rate first"
                      : usd > 0 && code !== "USD"
                        ? `≈ $${usd.toFixed(2)} USD`
                        : `Enter the ${amountLabel} amount in ${code}`
                }
                slotProps={{
                  htmlInput: { min: 0, step: "0.01" },
                  ...currencyAdornment,
                }}
              />
              {withFee && (
                <TextField
                  fullWidth
                  label={code ? `Transaction Fee (${code})` : "Transaction Fee"}
                  type="number"
                  value={part.transactionFee}
                  onChange={(e) =>
                    update(index, { transactionFee: e.target.value })
                  }
                  required
                  disabled={disabled || !code}
                  error={
                    part.transactionFee.trim() !== "" &&
                    !(Number(part.transactionFee) >= 0)
                  }
                  helperText="Enter 0 if there was no fee. For reference only."
                  slotProps={{
                    htmlInput: { min: 0, step: "0.01" },
                    ...currencyAdornment,
                  }}
                />
              )}
            </Stack>
          </Stack>
        );

        // A single part looks like the old single-currency form.
        if (!multi) return <Box key={part.key}>{body}</Box>;

        return (
          <Paper key={part.key} variant="outlined" sx={{ p: 2 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 2 }}
            >
              <Typography sx={{ fontWeight: 600 }}>
                Currency part {index + 1}
              </Typography>
              {index > 0 && (
                <Tooltip title="Remove this currency part">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => remove(index)}
                      disabled={disabled}
                      aria-label={`Remove currency part ${index + 1}`}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
            </Stack>
            {body}
          </Paper>
        );
      })}

      {!amountsDisabled && (
        <Box>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={add}
            disabled={disabled || parts.length >= MAX_PAYMENT_PARTS}
          >
            Add another currency
          </Button>
        </Box>
      )}

      {!amountsDisabled && (multi || remainingUsd !== null) && totalUsd > 0 && (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          {multi && (
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="textSecondary">
                Total of all parts (USD)
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                <CurrencyDisplay value={totalUsd} />
              </Typography>
            </Stack>
          )}
          {remainingUsd !== null && (
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="textSecondary">
                {remainingUsd >= -CENT_EPSILON ? "Still to enter" : "Over by"}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {Math.abs(remainingUsd) < CENT_EPSILON ? (
                  "Nothing - fully covered"
                ) : (
                  <>
                    <CurrencyDisplay value={Math.abs(remainingUsd)} />
                    {remainingUsd > 0 && lastRate && last.currencyCode
                      ? ` = ${formatCurrencyAmount(
                          usdToCurrency(remainingUsd, lastRate),
                          last.currencyCode,
                        )} at 1 USD = ${lastRate} ${last.currencyCode}`
                      : ""}
                  </>
                )}
              </Typography>
            </Stack>
          )}
        </Box>
      )}
    </Stack>
  );
}
