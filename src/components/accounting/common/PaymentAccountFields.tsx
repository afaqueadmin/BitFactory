"use client";

/**
 * Cascading Entity -> Bank -> Currency selects plus the exchange rate
 * (1 USD = X currency) for recording a payment. Only active records are
 * offered. Changing a parent clears its children; USD locks the rate to 1.
 */

import {
  Alert,
  FormControl,
  FormHelperText,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import {
  useAccountingBanks,
  useAccountingEntities,
} from "@/lib/hooks/usePaymentAccounts";

export interface PaymentAccountValue {
  entityId: string;
  bankId: string;
  currencyId: string;
  currencyCode: string;
  /** Kept as typed text; parse when submitting. */
  exchangeRate: string;
}

export const EMPTY_PAYMENT_ACCOUNT: PaymentAccountValue = {
  entityId: "",
  bankId: "",
  currencyId: "",
  currencyCode: "",
  exchangeRate: "",
};

/** Currency whose rate is fixed at 1 (amounts are already in USD). */
const BASE_CURRENCY = "USD";

/** Parsed exchange rate, or null when missing or not a positive number. */
export function parseExchangeRate(value: PaymentAccountValue): number | null {
  const rate = Number(value.exchangeRate);
  return value.exchangeRate.trim() !== "" && Number.isFinite(rate) && rate > 0
    ? rate
    : null;
}

export function isPaymentAccountComplete(value: PaymentAccountValue): boolean {
  return (
    !!value.entityId &&
    !!value.bankId &&
    !!value.currencyId &&
    parseExchangeRate(value) !== null
  );
}

interface PaymentAccountFieldsProps {
  value: PaymentAccountValue;
  onChange: (value: PaymentAccountValue) => void;
  disabled?: boolean;
}

export function PaymentAccountFields({
  value,
  onChange,
  disabled = false,
}: PaymentAccountFieldsProps) {
  const entitiesQuery = useAccountingEntities(true);
  const banksQuery = useAccountingBanks(true);
  const entities = entitiesQuery.data ?? [];
  const banks = (banksQuery.data ?? []).filter(
    (b) => b.entityId === value.entityId,
  );
  const currencies = (
    banks.find((b) => b.id === value.bankId)?.currencies ?? []
  )
    .map((c) => c.currency)
    .filter((c) => c.isActive);

  const loading = entitiesQuery.isLoading || banksQuery.isLoading;
  const loadError = entitiesQuery.error || banksQuery.error;
  const rateLocked = value.currencyCode === BASE_CURRENCY;
  const rateInvalid =
    value.exchangeRate.trim() !== "" && parseExchangeRate(value) === null;

  const selectCurrency = (currencyId: string) => {
    const code = currencies.find((c) => c.id === currencyId)?.code ?? "";
    onChange({
      ...value,
      currencyId,
      currencyCode: code,
      exchangeRate:
        code === BASE_CURRENCY
          ? "1"
          : value.currencyCode === BASE_CURRENCY
            ? ""
            : value.exchangeRate,
    });
  };

  return (
    <Stack spacing={2}>
      {loadError && (
        <Alert severity="error">
          Couldn&apos;t load entities and banks: {loadError.message}
        </Alert>
      )}

      <FormControl fullWidth required disabled={disabled || loading}>
        <InputLabel>Entity</InputLabel>
        <Select
          label="Entity"
          value={value.entityId}
          onChange={(e) =>
            onChange({
              ...EMPTY_PAYMENT_ACCOUNT,
              entityId: e.target.value,
            })
          }
        >
          {entities.map((entity) => (
            <MenuItem key={entity.id} value={entity.id}>
              {entity.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl
        fullWidth
        required
        disabled={disabled || loading || !value.entityId}
      >
        <InputLabel>Bank</InputLabel>
        <Select
          label="Bank"
          value={value.bankId}
          onChange={(e) =>
            onChange({
              ...EMPTY_PAYMENT_ACCOUNT,
              entityId: value.entityId,
              bankId: e.target.value,
            })
          }
        >
          {banks.map((bank) => (
            <MenuItem key={bank.id} value={bank.id}>
              {bank.name}
            </MenuItem>
          ))}
        </Select>
        {value.entityId && !loading && banks.length === 0 && (
          <FormHelperText>This entity has no active banks</FormHelperText>
        )}
      </FormControl>

      <FormControl
        fullWidth
        required
        disabled={disabled || loading || !value.bankId}
      >
        <InputLabel>Currency</InputLabel>
        <Select
          label="Currency"
          value={value.currencyId}
          onChange={(e) => selectCurrency(e.target.value)}
        >
          {currencies.map((currency) => (
            <MenuItem key={currency.id} value={currency.id}>
              {currency.code} — {currency.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        label="Exchange rate"
        type="number"
        required
        fullWidth
        value={value.exchangeRate}
        onChange={(e) => onChange({ ...value, exchangeRate: e.target.value })}
        disabled={disabled || !value.currencyId || rateLocked}
        error={rateInvalid}
        helperText={
          rateInvalid
            ? "Enter a rate greater than 0"
            : rateLocked
              ? "USD payments use a rate of 1"
              : "How many units of the payment currency equal 1 USD"
        }
        slotProps={{
          htmlInput: { min: 0, step: "any" },
          input: {
            startAdornment: (
              <InputAdornment position="start">1 USD =</InputAdornment>
            ),
            endAdornment: value.currencyCode ? (
              <InputAdornment position="end">
                {value.currencyCode}
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
    </Stack>
  );
}
