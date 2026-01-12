/**
 * Date Display Component
 *
 * Formats and displays dates consistently
 */

import { Typography, TypographyProps } from "@mui/material";

interface DateDisplayProps {
  date: Date | string;
  format?: "date" | "datetime";
  variant?: TypographyProps["variant"];
  color?: TypographyProps["color"];
}

export function DateDisplay({
  date,
  format = "date",
  variant = "body2",
  color = "textSecondary",
}: DateDisplayProps) {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  const formatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(format === "datetime" && {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  });

  const formatted = formatter.format(dateObj);

  return (
    <Typography variant={variant} color={color}>
      {formatted}
    </Typography>
  );
}
