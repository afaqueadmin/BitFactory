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
  standalone?: boolean; // If true, wraps in Typography. If false, just returns text
}

export function DateDisplay({
  date,
  format = "date",
  variant = "body2",
  color = "textSecondary",
  standalone = false,
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

  // If standalone, wrap in Typography. Otherwise, just return the text
  if (standalone) {
    return (
      <Typography variant={variant} color={color}>
        {formatted}
      </Typography>
    );
  }

  // Return as span to avoid nested paragraph issues
  return <span>{formatted}</span>;
}
