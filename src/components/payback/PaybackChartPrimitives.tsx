"use client";

/**
 * Presentation primitives for the payback analysis graphical view.
 *
 * These are deliberately dumb: every number they render is computed by
 * `@/lib/helpers/paybackCalculations` and passed in. Nothing here does
 * financial arithmetic beyond laying values out on an axis.
 */

import { ReactNode } from "react";
import { Box, Paper, Typography, Tooltip, useTheme } from "@mui/material";

/** Chart series colours. Validated for contrast in both light and dark mode. */
export const SERIES = {
  primary: "#2a78d6",
  primaryDark: "#3987e5",
  accent: "#eb6834",
  accentDark: "#d95926",
  good: "#1c7048",
  goodDark: "#46a377",
  bad: "#b8352b",
  badDark: "#e2716a",
} as const;

export function useSeriesColors() {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  return {
    primary: dark ? SERIES.primaryDark : SERIES.primary,
    accent: dark ? SERIES.accentDark : SERIES.accent,
    good: dark ? SERIES.goodDark : SERIES.good,
    bad: dark ? SERIES.badDark : SERIES.bad,
    grid: theme.palette.divider,
    axis: theme.palette.text.secondary,
    surface: theme.palette.background.paper,
  };
}

/* ------------------------------------------------------------------ */
/* Hero answer tile                                                    */
/* ------------------------------------------------------------------ */

export function AnswerTile({
  label,
  value,
  note,
  tone = "default",
  emphasis = false,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "default" | "good" | "bad";
  emphasis?: boolean;
}) {
  const theme = useTheme();
  const c = useSeriesColors();
  const valueColor =
    tone === "good"
      ? c.good
      : tone === "bad"
        ? c.bad
        : emphasis
          ? c.primary
          : theme.palette.text.primary;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, sm: 2.25 },
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        height: "100%",
        borderColor: emphasis ? c.primary : undefined,
        backgroundColor: emphasis
          ? theme.palette.mode === "dark"
            ? "rgba(57,135,229,0.10)"
            : "rgba(42,120,214,0.06)"
          : undefined,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: "0.09em",
          fontWeight: 600,
          color: "text.secondary",
          fontSize: "0.68rem",
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: { xs: "1.6rem", sm: "1.9rem" },
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: "-0.03em",
          fontVariantNumeric: "tabular-nums",
          color: valueColor,
        }}
      >
        {value}
      </Typography>
      {note && (
        <Typography
          variant="body2"
          sx={{ color: "text.secondary", fontSize: "0.78rem", lineHeight: 1.4 }}
        >
          {note}
        </Typography>
      )}
    </Paper>
  );
}

/* ------------------------------------------------------------------ */
/* Section shell                                                       */
/* ------------------------------------------------------------------ */

export function ChartCard({
  title,
  subtitle,
  legend,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          pt: 2,
          pb: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 650, fontSize: "1rem" }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", fontSize: "0.82rem", mt: 0.25 }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Box>
      <Box sx={{ p: { xs: 1, sm: 1.5 }, overflowX: "auto" }}>{children}</Box>
      {legend && (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 2,
            px: { xs: 2, sm: 2.5 },
            pb: 2,
            pt: 0.5,
          }}
        >
          {legend}
        </Box>
      )}
    </Paper>
  );
}

export function LegendKey({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.9 }}>
      <Box
        sx={{
          width: 16,
          height: 0,
          borderTop: dashed ? "2px dashed" : "3px solid",
          borderColor: color,
          borderRadius: 1,
        }}
      />
      <Typography variant="body2" sx={{ fontSize: "0.79rem" }}>
        {label}
      </Typography>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Break-even headroom gauge                                           */
/* ------------------------------------------------------------------ */

export function HeadroomGauge({
  currentPrice,
  shutdownPrice,
}: {
  currentPrice: number;
  shutdownPrice: number;
}) {
  const theme = useTheme();
  const c = useSeriesColors();

  // Scale the track so both markers sit comfortably inside it.
  const max = Math.max(currentPrice, shutdownPrice) * 1.45;
  const pct = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));

  const canFallPct =
    currentPrice > 0
      ? Math.max(0, ((currentPrice - shutdownPrice) / currentPrice) * 100)
      : 0;
  const isSafe = currentPrice > shutdownPrice;

  const fmt = (v: number) =>
    "$" + Math.round(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

  return (
    <Box sx={{ px: { xs: 1, sm: 1.5 }, pt: 3.5, pb: 1 }}>
      <Box
        sx={{
          position: "relative",
          height: 42,
          borderRadius: 1,
          border: 1,
          borderColor: "divider",
          backgroundColor:
            theme.palette.mode === "dark"
              ? "rgba(70,163,119,0.13)"
              : "rgba(28,112,72,0.09)",
        }}
      >
        {/* Zone below the shutdown price: the miner earns less than its bill */}
        <Box
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct(shutdownPrice)}%`,
            borderRight: `2px solid ${c.bad}`,
            borderRadius: "4px 0 0 4px",
            backgroundColor:
              theme.palette.mode === "dark"
                ? "rgba(226,113,106,0.16)"
                : "rgba(184,53,43,0.10)",
          }}
        >
          <Typography
            sx={{
              position: "absolute",
              bottom: -22,
              right: 0,
              transform: "translateX(50%)",
              fontSize: "0.7rem",
              fontWeight: 600,
              color: c.bad,
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            Stops earning below {fmt(shutdownPrice)}
          </Typography>
        </Box>

        {/* Today's BTC price */}
        <Tooltip title={`BTC today ${fmt(currentPrice)}`} arrow>
          <Box
            sx={{
              position: "absolute",
              left: `${pct(currentPrice)}%`,
              top: -7,
              bottom: -7,
              width: 2,
              backgroundColor: theme.palette.text.primary,
            }}
          >
            <Typography
              sx={{
                position: "absolute",
                top: -21,
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: "0.72rem",
                fontWeight: 700,
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              BTC today {fmt(currentPrice)}
            </Typography>
          </Box>
        </Tooltip>
      </Box>

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          mt: 3.25,
          color: "text.secondary",
          fontSize: "0.72rem",
        }}
      >
        <span>$0</span>
        <span>{fmt(max)}</span>
      </Box>

      <Typography
        sx={{
          mt: 1.5,
          fontSize: "0.9rem",
          color: isSafe ? c.good : c.bad,
          fontWeight: 600,
        }}
      >
        {isSafe
          ? `Bitcoin can fall ${canFallPct.toFixed(0)}% before this miner stops covering its bill.`
          : `Bitcoin is below the level at which this miner covers its bill.`}
      </Typography>
    </Box>
  );
}
