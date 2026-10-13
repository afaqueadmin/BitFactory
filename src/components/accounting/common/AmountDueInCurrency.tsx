"use client";

import { Box, Typography } from "@mui/material";
import {
  conversionRate,
  formatCurrencyAmount,
  PaymentAccountValue,
  usdToCurrency,
} from "@/components/accounting/common/PaymentAccountFields";

/**
 * "Amount due in AED: 20.00 AED (at 1 USD = 2 AED)" under a USD amount on
 * the payment screens, so the admin sees what to collect in the payment
 * currency. Renders nothing for USD, without a valid rate, or when nothing
 * is due.
 */
export function AmountDueInCurrency({
  usd,
  account,
  compact = false,
}: {
  usd: number;
  account: PaymentAccountValue;
  /** Smaller variant for the per-section rows of the split form. */
  compact?: boolean;
}) {
  const rate = conversionRate(account);
  if (!rate || !(usd > 0)) return null;
  const code = account.currencyCode;

  return (
    <Box sx={{ mt: compact ? 0.25 : 1, textAlign: compact ? "right" : "left" }}>
      <Typography color="textSecondary" variant={compact ? "caption" : "body2"}>
        Amount due in {code}
      </Typography>
      <Typography
        sx={{ fontWeight: compact ? 600 : 700 }}
        variant={compact ? "body2" : "h6"}
      >
        {formatCurrencyAmount(usdToCurrency(usd, rate), code)}
      </Typography>
      <Typography
        color="textSecondary"
        variant="caption"
        sx={{ display: "block" }}
      >
        at 1 USD = {rate} {code}
      </Typography>
    </Box>
  );
}
