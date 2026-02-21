/**
 * Currency Display Component
 *
 * Formats and displays currency values
 */

import { Decimal } from "@prisma/client/runtime/library";
import { Typography, TypographyProps } from "@mui/material";
import {
  CURRENCY_FORMAT_OPTIONS,
  CURRENCY_LOCALE,
} from "@/lib/constants/accounting";

interface CurrencyDisplayProps {
  value: number | Decimal | string;
  variant?: TypographyProps["variant"];
  color?: TypographyProps["color"];
  fontWeight?: "bold" | "normal" | number;
  standalone?: boolean; // If true, wraps in Typography. If false, just returns text
}

export function CurrencyDisplay({
  value,
  variant = "body2",
  color = "textPrimary",
  fontWeight = "normal",
  standalone = false,
}: CurrencyDisplayProps) {
  const numValue =
    typeof value === "string" ? parseFloat(value) : Number(value);
  const formatter = new Intl.NumberFormat(
    CURRENCY_LOCALE,
    CURRENCY_FORMAT_OPTIONS,
  );
  const formatted = formatter.format(numValue);

  // If standalone, wrap in Typography. Otherwise, just return the text
  if (standalone) {
    return (
      <Typography variant={variant} color={color} sx={{ fontWeight }}>
        {formatted}
      </Typography>
    );
  }

  // Return as span to avoid nested paragraph issues
  return <span>{formatted}</span>;
}
