// src/components/daylight/DaylightMuiScope.tsx
"use client";

/**
 * A nested MUI theme that maps the stock MUI components (Paper, Card, Button,
 * inputs, tables, chips, alerts, tabs, dialogs ...) onto Daylight tokens.
 *
 * Used for the admin detail / form screens (invoice view, edit, create,
 * record payment, payables) which are built from plain MUI parts plus shared
 * accounting components: wrapping the page re-skins all of it without
 * restyling every element by hand. It is scoped - nothing outside the
 * wrapper changes - and it also covers dialogs opened from inside it, since
 * MUI themes travel through React context into portals.
 *
 * `DaylightThemedPage` = this theme + the DaylightAdminPage canvas/padding.
 */

import React from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { Box } from "@mui/material";
import {
  DaylightPalette,
  RADIUS_CARD,
  RADIUS_CONTROL,
  daylightFonts,
  useDaylight,
} from "@/lib/daylight";
import { DaylightAdminPage } from "@/components/daylight/AdminPage";

type Tone = { bg: string; text: string; border: string };

function tones(d: DaylightPalette): Record<string, Tone> {
  return {
    primary: { bg: d.skySoft, text: d.action, border: d.borderSky },
    info: { bg: d.skySoft, text: d.action, border: d.borderSky },
    success: { bg: d.mint, text: d.success, border: d.borderMint },
    warning: { bg: d.amber, text: d.warning, border: d.borderAmber },
    error: { bg: d.dangerSoft, text: d.danger, border: d.borderDanger },
    secondary: { bg: d.hover, text: d.muted, border: d.border },
    default: { bg: d.hover, text: d.muted, border: d.border },
  };
}

export function buildDaylightMuiTheme(d: DaylightPalette, darkMode: boolean) {
  const t = tones(d);
  const fonts = daylightFonts;
  const chipColor = (key: string) => ({
    backgroundColor: t[key].bg,
    color: t[key].text,
    "& .MuiChip-icon, & .MuiChip-deleteIcon": { color: t[key].text },
  });
  const chipOutlined = (key: string) => ({
    backgroundColor: "transparent",
    color: t[key].text,
    borderColor: t[key].border,
  });

  return createTheme({
    palette: {
      mode: darkMode ? "dark" : "light",
      primary: { main: d.action, dark: d.actionHover, contrastText: d.surface },
      secondary: { main: d.muted, contrastText: d.surface },
      success: { main: d.success, contrastText: d.surface },
      warning: { main: d.warning, contrastText: d.surface },
      error: { main: d.danger, contrastText: d.surface },
      info: { main: d.action, contrastText: d.surface },
      background: { default: d.canvas, paper: d.surface },
      text: { primary: d.text, secondary: d.muted },
      divider: d.border,
      action: { hover: d.hover, selected: d.skySoft },
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: fonts.body,
      h1: {
        fontFamily: fonts.heading,
        fontWeight: 750,
        fontSize: "2rem",
        letterSpacing: "-.03em",
      },
      h2: {
        fontFamily: fonts.heading,
        fontWeight: 750,
        fontSize: "1.75rem",
        letterSpacing: "-.03em",
      },
      h3: {
        fontFamily: fonts.heading,
        fontWeight: 750,
        fontSize: "1.625rem",
        letterSpacing: "-.03em",
      },
      h4: {
        fontFamily: fonts.heading,
        fontWeight: 750,
        fontSize: "1.625rem",
        letterSpacing: "-.03em",
        lineHeight: 1.25,
      },
      h5: {
        fontFamily: fonts.heading,
        fontWeight: 700,
        fontSize: "1.25rem",
        letterSpacing: "-.02em",
      },
      h6: { fontFamily: fonts.heading, fontWeight: 700, fontSize: "1rem" },
      subtitle1: { fontWeight: 600, fontSize: "0.875rem" },
      subtitle2: { fontWeight: 600, fontSize: "0.8125rem" },
      body1: { fontSize: "0.875rem" },
      body2: { fontSize: "0.8125rem" },
      caption: { fontSize: "0.75rem", color: d.muted },
      button: { textTransform: "none", fontWeight: 650 },
    },
    components: {
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: "none", backgroundColor: d.surface },
          rounded: { borderRadius: RADIUS_CARD },
          elevation0: { border: `1px solid ${d.border}`, boxShadow: d.shadow },
          outlined: { borderColor: d.border },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: `1px solid ${d.border}`,
            borderRadius: RADIUS_CARD,
            boxShadow: d.shadow,
            overflow: "hidden",
          },
        },
      },
      MuiCardHeader: {
        styleOverrides: {
          root: { padding: "18px 24px" },
          title: {
            fontFamily: fonts.heading,
            fontWeight: 700,
            fontSize: 16,
            color: d.text,
          },
          subheader: { fontSize: 13, color: d.muted },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: { padding: "20px 24px", "&:last-child": { paddingBottom: 22 } },
        },
      },
      MuiDivider: { styleOverrides: { root: { borderColor: d.border } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: RADIUS_CONTROL,
            fontFamily: fonts.body,
            fontWeight: 650,
            textTransform: "none",
            boxShadow: "none",
            "&:hover": { boxShadow: "none" },
          },
          sizeMedium: { minHeight: 40 },
          containedPrimary: {
            backgroundColor: d.action,
            color: d.surface,
            "&:hover": { backgroundColor: d.actionHover },
          },
          outlined: {
            backgroundColor: d.surface,
            "&.Mui-disabled": { borderColor: d.border },
          },
          outlinedPrimary: {
            color: d.text,
            borderColor: d.inputBorder,
            "&:hover": { backgroundColor: d.hover, borderColor: d.action },
          },
          outlinedError: {
            color: d.danger,
            borderColor: d.borderDanger,
            "&:hover": { backgroundColor: d.dangerSoft, borderColor: d.danger },
          },
          outlinedSuccess: {
            color: d.success,
            borderColor: d.borderMint,
            "&:hover": { backgroundColor: d.mint, borderColor: d.success },
          },
          outlinedInherit: { borderColor: d.inputBorder },
          textPrimary: {
            color: d.action,
            "&:hover": { backgroundColor: d.hover },
          },
          containedInherit: { backgroundColor: d.hover, color: d.text },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { borderRadius: RADIUS_CONTROL } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS_CONTROL,
            fontFamily: fonts.body,
            backgroundColor: d.surface,
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: d.inputBorder,
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: d.action,
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: d.action,
              borderWidth: 2,
            },
            "&.Mui-disabled .MuiOutlinedInput-notchedOutline": {
              borderColor: d.border,
            },
          },
          input: { fontSize: 14 },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            fontFamily: fonts.body,
            color: d.muted,
            "&.Mui-focused": { color: d.action },
          },
        },
      },
      MuiFormHelperText: {
        styleOverrides: { root: { fontFamily: fonts.body, color: d.muted } },
      },
      MuiFormLabel: {
        styleOverrides: { root: { fontFamily: fonts.body, color: d.muted } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { fontFamily: fonts.body, borderBottomColor: d.border },
          head: {
            fontWeight: 600,
            fontSize: 10,
            letterSpacing: ".015em",
            textTransform: "uppercase",
            color: d.muted,
            backgroundColor: d.tableHead,
          },
          body: { fontSize: 13, color: d.text },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          hover: { "&:hover": { backgroundColor: `${d.hover} !important` } },
        },
      },
      MuiTablePagination: {
        styleOverrides: {
          root: { color: d.muted, borderTop: `1px solid ${d.border}` },
          selectLabel: { fontSize: 12.5 },
          displayedRows: { fontSize: 12.5 },
        },
      },
      MuiChip: {
        styleOverrides: {
          // MUI v7 has no per-colour keys: derive tone from ownerState.
          root: ({ ownerState }) => {
            const key =
              ownerState.color && t[ownerState.color]
                ? ownerState.color
                : "default";
            return {
              borderRadius: 999,
              fontFamily: fonts.body,
              fontWeight: 650,
              fontSize: 11,
              height: 22,
              "& .MuiChip-label": { paddingLeft: 9, paddingRight: 9 },
              ...(ownerState.variant === "outlined"
                ? chipOutlined(key)
                : chipColor(key)),
            };
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS_CONTROL,
            fontFamily: fonts.body,
            fontSize: 13,
          },
          standardSuccess: {
            backgroundColor: t.success.bg,
            color: t.success.text,
            "& .MuiAlert-icon": { color: t.success.text },
          },
          standardInfo: {
            backgroundColor: t.info.bg,
            color: t.info.text,
            "& .MuiAlert-icon": { color: t.info.text },
          },
          standardWarning: {
            backgroundColor: t.warning.bg,
            color: t.warning.text,
            "& .MuiAlert-icon": { color: t.warning.text },
          },
          standardError: {
            backgroundColor: t.error.bg,
            color: t.error.text,
            "& .MuiAlert-icon": { color: t.error.text },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 40, borderBottom: `1px solid ${d.border}` },
          indicator: { backgroundColor: d.action, height: 2 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 40,
            textTransform: "none",
            fontFamily: fonts.body,
            fontSize: 13,
            fontWeight: 600,
            color: d.muted,
            "&.Mui-selected": { color: d.action },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: RADIUS_CARD, border: `1px solid ${d.border}` },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: { fontFamily: fonts.heading, fontWeight: 700, fontSize: 17 },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: "12px !important",
            boxShadow: "0 8px 30px rgba(100,114,124,.13) !important",
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: { root: { fontFamily: fonts.body, fontSize: 13 } },
      },
      MuiTooltip: { styleOverrides: { tooltip: { fontFamily: fonts.body } } },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 999, backgroundColor: d.border },
        },
      },
      MuiCircularProgress: { defaultProps: { color: "primary" } },
      // Gap-based spacing so rows of buttons can wrap (see the wrapper below).
      MuiStack: { defaultProps: { useFlexGap: true } },
    },
  });
}

/** Scoped Daylight MUI theme (no layout of its own). */
export function DaylightMuiScope({ children }: { children: React.ReactNode }) {
  const { d, darkMode } = useDaylight();
  const theme = React.useMemo(
    () => buildDaylightMuiTheme(d, darkMode),
    [d, darkMode],
  );
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

/**
 * Daylight MUI theme + admin page canvas/padding. Also exposes the palette
 * as CSS variables (`--dl-*`) so hard-coded colours in these pages can be
 * written as `var(--dl-muted, #666)`: Daylight inside the wrapper, the old
 * colour anywhere else (e.g. a shared component on an unthemed page).
 */
export function DaylightThemedPage({
  children,
}: {
  children: React.ReactNode;
}) {
  const { d, fonts } = useDaylight();
  const vars = {
    "--dl-text": d.text,
    "--dl-muted": d.muted,
    "--dl-border": d.border,
    "--dl-canvas": d.canvas,
    "--dl-surface": d.surface,
    "--dl-table-head": d.tableHead,
    "--dl-hover": d.hover,
    "--dl-action": d.action,
    "--dl-sky-soft": d.skySoft,
    "--dl-border-sky": d.borderSky,
    "--dl-danger": d.danger,
    "--dl-danger-soft": d.dangerSoft,
    "--dl-border-danger": d.borderDanger,
    "--dl-success": d.success,
    "--dl-mint": d.mint,
  } as React.CSSProperties;
  return (
    <DaylightMuiScope>
      <Box
        style={vars}
        sx={{
          // Flex column so the canvas below fills short pages (a percentage
          // min-height would not resolve through this wrapper).
          minHeight: "100%",
          display: "flex",
          flexDirection: "column",
          "& > *": { flexGrow: 1 },
          // Button rows on these pages are fixed `direction="row"` Stacks;
          // let them wrap instead of pushing the page sideways on phones.
          // (Only button rows: a wrapping column Stack stops stretching.)
          "& .MuiStack-root:has(> .MuiButton-root, > a > .MuiButton-root)": {
            flexWrap: "wrap",
          },
          // Plain <h1>/<h3> titles in these pages (not Typography).
          "& h1:not(.MuiTypography-root)": {
            fontFamily: fonts.heading,
            fontWeight: 750,
            fontSize: { xs: 22, sm: 26 },
            letterSpacing: "-.6px",
            lineHeight: 1.25,
            color: d.text,
          },
          "& h3:not(.MuiTypography-root)": {
            fontFamily: fonts.heading,
            fontWeight: 700,
            fontSize: 16,
            color: d.text,
          },
          // Tables not in a TableContainer scroll inside their parent.
          "& :has(> .MuiTable-root):not(.MuiTableContainer-root)": {
            overflowX: "auto",
          },
        }}
      >
        <DaylightAdminPage>{children}</DaylightAdminPage>
      </Box>
    </DaylightMuiScope>
  );
}
