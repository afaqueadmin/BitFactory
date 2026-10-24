// src/components/daylight/AdminPage.tsx
"use client";

/**
 * Daylight building blocks for admin list pages (work-queue pages: tickets,
 * hashrate alerts, wallet / payment-frequency / firmware / sign-in email
 * requests). Each page is a header, a filter bar, a table card and some
 * row actions, so the shared chrome lives here instead of being re-declared
 * in six files. Dialogs keep default MUI styling (deferred-modal policy).
 */

import React from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import {
  DaylightPalette,
  RADIUS_CARD,
  RADIUS_CONTROL,
  focusRing,
  useDaylight,
} from "@/lib/daylight";

export type DaylightTone =
  "warning" | "info" | "success" | "danger" | "neutral";

function toneColors(d: DaylightPalette, tone: DaylightTone) {
  return {
    warning: { bg: d.amber, text: d.warning },
    info: { bg: d.skySoft, text: d.action },
    success: { bg: d.mint, text: d.success },
    danger: { bg: d.dangerSoft, text: d.danger },
    neutral: { bg: d.hover, text: d.muted },
  }[tone];
}

/** Request-workflow status -> pill tone (PENDING / CONFIRMED / ...). */
export function requestStatusTone(status: string): DaylightTone {
  switch (status) {
    case "PENDING":
      return "warning";
    case "CONFIRMED":
      return "info";
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "danger";
    default:
      return "neutral";
  }
}

/** "PENDING" -> "Pending" for display; filters keep the raw value. */
export const statusLabel = (status: string) =>
  status.charAt(0) + status.slice(1).toLowerCase();

/** Canvas background + page padding, content capped at 1400px. */
export function DaylightAdminPage({ children }: { children: React.ReactNode }) {
  const { d, fonts } = useDaylight();
  return (
    <Box
      sx={{
        p: { xs: "24px 16px", sm: "28px 24px", md: "32px 36px" },
        bgcolor: d.canvas,
        minHeight: "100%",
        fontFamily: fonts.body,
        color: d.text,
      }}
    >
      <Box sx={{ maxWidth: 1400, mx: "auto" }}>{children}</Box>
    </Box>
  );
}

export function DaylightPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  /** Page-level buttons, right-aligned (stacked under the title on phones). */
  actions?: React.ReactNode;
}) {
  const { d, fonts } = useDaylight();
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "flex-start", sm: "flex-end" },
        justifyContent: "space-between",
        gap: 2,
        mb: { xs: "20px", md: "24px" },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="h1"
          sx={{
            m: 0,
            fontFamily: fonts.heading,
            fontWeight: 750,
            fontSize: { xs: 22, sm: 26 },
            letterSpacing: "-.6px",
            lineHeight: 1.25,
            color: d.text,
          }}
        >
          {title}
        </Typography>
        {description && (
          <Box
            sx={{
              mt: "6px",
              maxWidth: 820,
              fontSize: 13,
              lineHeight: 1.55,
              color: d.muted,
            }}
          >
            {description}
          </Box>
        )}
      </Box>
      {actions && (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            // Phones: buttons wrap under each other instead of overflowing.
            flexShrink: { xs: 1, sm: 0 },
            maxWidth: "100%",
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
}

export function DaylightStatusPill({
  label,
  tone,
}: {
  label: string;
  tone: DaylightTone;
}) {
  const { d, fonts } = useDaylight();
  const c = toneColors(d, tone);
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        px: "9px",
        py: "2px",
        borderRadius: "999px",
        bgcolor: c.bg,
        color: c.text,
        fontFamily: fonts.body,
        fontSize: 11,
        fontWeight: 650,
        lineHeight: 1.6,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Box>
  );
}

/** Centered spinner for a list that is loading. */
export function DaylightLoading() {
  const { d } = useDaylight();
  return (
    <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
      <CircularProgress sx={{ color: d.action }} />
    </Box>
  );
}

/** Empty-list card ("No requests found."). */
export function DaylightEmptyState({
  children,
}: {
  children: React.ReactNode;
}) {
  const { d } = useDaylight();
  return (
    <Box
      sx={{
        bgcolor: d.surface,
        border: `1px solid ${d.border}`,
        borderRadius: RADIUS_CARD,
        boxShadow: d.shadow,
        p: { xs: "28px 16px", sm: "40px 24px" },
        textAlign: "center",
        fontSize: 13,
        color: d.muted,
      }}
    >
      {children}
    </Box>
  );
}

/** Small muted line under a cell's main value (email, "by ...", etc.). */
export function CellNote({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "danger";
}) {
  const { d } = useDaylight();
  return (
    <Box
      component="span"
      sx={{
        display: "block",
        mt: "2px",
        fontSize: 11.5,
        lineHeight: 1.45,
        color: tone === "danger" ? d.danger : d.muted,
      }}
    >
      {children}
    </Box>
  );
}

/** sx objects for the controls and table on a Daylight admin list page. */
export function useDaylightAdminSx() {
  const { d, fonts } = useDaylight();

  const btnBase = {
    textTransform: "none",
    fontFamily: fonts.body,
    fontWeight: 650,
    fontSize: 13,
    borderRadius: RADIUS_CONTROL,
    boxShadow: "none",
    whiteSpace: "nowrap",
    "&:hover": { boxShadow: "none" },
    "&.Mui-focusVisible": focusRing(d.action),
  } as const;

  const filled = (bg: string, hover: string) =>
    ({
      ...btnBase,
      bgcolor: bg,
      color: d.surface,
      "&:hover": { bgcolor: hover, boxShadow: "none" },
      "&.Mui-disabled": { bgcolor: d.border, color: d.muted },
    }) as const;

  const tableSx = {
    overflowX: "auto",
    "& .MuiTableHead-root": { bgcolor: d.tableHead },
    "& .MuiTableCell-head": {
      fontFamily: fonts.body,
      fontWeight: 600,
      fontSize: 10,
      letterSpacing: ".015em",
      textTransform: "uppercase",
      color: d.muted,
      borderBottomColor: d.border,
      py: "12px",
      px: "12px",
      whiteSpace: "nowrap",
    },
    "& .MuiTableSortLabel-root": {
      color: "inherit",
      "&:hover": { color: d.text },
      "&.Mui-active": { color: d.text },
      "& .MuiTableSortLabel-icon": { color: `${d.muted} !important` },
    },
    "& .MuiTableCell-body": {
      fontFamily: fonts.body,
      fontSize: 13,
      color: d.text,
      borderBottomColor: d.border,
      py: "12px",
      px: "12px",
      verticalAlign: "top",
    },
    "& .MuiTableBody-root .MuiTableRow-root:last-of-type .MuiTableCell-body": {
      borderBottom: 0,
    },
    "& .MuiTableBody-root .MuiTableRow-root:hover": { bgcolor: d.hover },
    // Outer cells keep the card's 16px inset.
    "& .MuiTableCell-root:first-of-type": { pl: "16px" },
    "& .MuiTableCell-root:last-of-type": { pr: "16px" },
  };

  return {
    /** Apply to a TextField, or to a wrapper holding several of them. */
    inputSx: {
      "& .MuiOutlinedInput-root": {
        borderRadius: RADIUS_CONTROL,
        fontFamily: fonts.body,
        fontSize: 13,
        bgcolor: d.surface,
        "& fieldset": { borderColor: d.inputBorder },
        "&:hover fieldset": { borderColor: d.action },
        "&.Mui-focused fieldset": { borderColor: d.action, borderWidth: "2px" },
      },
      "& .MuiInputLabel-root": {
        fontFamily: fonts.body,
        fontSize: 13,
        color: d.muted,
        "&.Mui-focused": { color: d.action },
      },
    },
    primaryBtnSx: filled(d.action, d.actionHover),
    // No darker success token, so hover dims the fill instead.
    successBtnSx: {
      ...filled(d.success, d.success),
      "&:hover": {
        bgcolor: d.success,
        filter: "brightness(.9)",
        boxShadow: "none",
      },
    },
    outlineBtnSx: {
      ...btnBase,
      color: d.text,
      borderColor: d.inputBorder,
      bgcolor: d.surface,
      "&:hover": { bgcolor: d.hover, borderColor: d.action },
      "&.Mui-disabled": { color: d.muted, borderColor: d.border },
    },
    dangerOutlineBtnSx: {
      ...btnBase,
      color: d.danger,
      borderColor: d.borderDanger,
      bgcolor: d.surface,
      "&:hover": { bgcolor: d.dangerSoft, borderColor: d.danger },
      "&.Mui-disabled": { color: d.muted, borderColor: d.border },
    },
    alertSx: (tone: "success" | "error" | "info" | "warning") => {
      const c = {
        success: { bg: d.mint, text: d.success },
        error: { bg: d.dangerSoft, text: d.danger },
        info: { bg: d.skySoft, text: d.action },
        warning: { bg: d.amber, text: d.warning },
      }[tone];
      return {
        borderRadius: RADIUS_CONTROL,
        bgcolor: c.bg,
        color: c.text,
        fontFamily: fonts.body,
        fontSize: 13,
        "& .MuiAlert-icon": { color: c.text },
      };
    },
    /** Surface card chrome for a page section. */
    cardSx: {
      bgcolor: d.surface,
      backgroundImage: "none",
      border: `1px solid ${d.border}`,
      borderRadius: RADIUS_CARD,
      boxShadow: d.shadow,
      p: { xs: "16px", sm: "20px 24px" },
    },
    /** Section heading inside a card or above a table. */
    sectionTitleSx: {
      m: 0,
      fontFamily: fonts.heading,
      fontWeight: 700,
      fontSize: 16,
      color: d.text,
    },
    /** Compact text button for row actions (Ledger, Approve, Deactivate). */
    textBtnSx: (tone: "action" | "success" | "danger" = "action") => {
      const c = {
        action: { text: d.action, hover: d.skySoft },
        success: { text: d.success, hover: d.mint },
        danger: { text: d.danger, hover: d.dangerSoft },
      }[tone];
      return {
        ...btnBase,
        fontWeight: 600,
        minWidth: 0,
        px: "8px",
        color: c.text,
        "&:hover": { bgcolor: c.hover },
        "&.Mui-disabled": { color: d.muted },
      };
    },
    /** Table styling only (header, body, sort labels, row hover) - for a
     * table that sits inside a larger card. Wide tables scroll sideways. */
    tableSx,
    /**
     * Card chrome + table styling for a `<TableContainer>`. Styles header and
     * body cells through descendant selectors so the table markup stays as
     * it is. Wide tables scroll sideways inside the card, never the page.
     */
    tableCardSx: {
      ...tableSx,
      bgcolor: d.surface,
      backgroundImage: "none",
      border: `1px solid ${d.border}`,
      borderRadius: RADIUS_CARD,
      boxShadow: d.shadow,
    },
  };
}
