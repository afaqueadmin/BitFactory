/**
 * Stats Card Component
 *
 * Reusable card for displaying accounting statistics. Daylight styling: a
 * white card with a small tone marker; only the admin accounting list pages
 * use it.
 */

import { Box, CircularProgress, Typography } from "@mui/material";
import { CurrencyDisplay } from "../common/CurrencyDisplay";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

interface StatsCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  loading?: boolean;
  color?: "primary" | "success" | "warning" | "error" | "info";
  isCurrency?: boolean;
}

export function StatsCard({
  label,
  value,
  subtext,
  loading = false,
  color = "primary",
  isCurrency = false,
}: StatsCardProps) {
  const { d, fonts } = useDaylight();
  const tone = {
    primary: d.action,
    info: d.action,
    success: d.success,
    warning: d.warning,
    error: d.danger,
  }[color];

  return (
    <Box
      role="article"
      aria-label={label}
      sx={{
        height: "100%",
        minWidth: 0,
        bgcolor: d.surface,
        border: `1px solid ${d.border}`,
        borderRadius: RADIUS_CARD,
        boxShadow: d.shadow,
        p: { xs: "16px", sm: "20px" },
        fontFamily: fonts.body,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: { xs: 13, md: 14 },
          fontWeight: 600,
          color: d.muted,
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: 8,
            height: 8,
            borderRadius: "2px",
            bgcolor: tone,
            flexShrink: 0,
          }}
        />
        {label}
      </Box>

      <Box sx={{ mt: "12px", minHeight: 32 }}>
        {loading ? (
          <CircularProgress size={28} sx={{ color: d.action }} />
        ) : (
          <Typography
            component="div"
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 750,
              fontSize: { xs: 22, sm: 24, lg: 26 },
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              color: d.text,
              fontVariantNumeric: "tabular-nums",
              overflowWrap: "anywhere",
              "& .MuiTypography-root": { font: "inherit", color: "inherit" },
            }}
          >
            {isCurrency ? (
              <CurrencyDisplay
                value={typeof value === "number" ? value : 0}
                standalone={false}
              />
            ) : (
              value
            )}
          </Typography>
        )}
      </Box>

      {subtext && (
        <Box sx={{ mt: "6px", fontSize: 12, color: d.muted }}>{subtext}</Box>
      )}
    </Box>
  );
}
