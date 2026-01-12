/**
 * Currency Display Component
 *
 * Formats and displays currency values
 */

import { Typography, TypographyProps } from "@mui/material";
import {
  CURRENCY_FORMAT_OPTIONS,
  CURRENCY_LOCALE,
} from "@/lib/constants/accounting";

interface CurrencyDisplayProps {
  value: number;
  variant?: TypographyProps["variant"];
  color?: TypographyProps["color"];
  fontWeight?: "bold" | "normal" | number;
}

export function CurrencyDisplay({
  value,
  variant = "body2",
  color = "textPrimary",
  fontWeight = "normal",
}: CurrencyDisplayProps) {
  const formatter = new Intl.NumberFormat(
    CURRENCY_LOCALE,
    CURRENCY_FORMAT_OPTIONS,
  );
  const formatted = formatter.format(value);

  return (
    <Typography variant={variant} color={color} sx={{ fontWeight }}>
      {formatted}
    </Typography>
  );
}
