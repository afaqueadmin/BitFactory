// src/lib/daylight.ts
"use client";

/**
 * BitFactory Daylight theme (v1.3) - design tokens for the client dashboard
 * and the client header.
 *
 * Light values are taken 1:1 from the Daylight style guide. The guide only
 * defines a light theme, but the portal has a dark-mode toggle, so a dark
 * counterpart is provided to keep that toggle working.
 */

import { Inter, Manrope } from "next/font/google";
import { useTheme } from "@/app/theme-provider";

const inter = Inter({ subsets: ["latin"], display: "swap" });
const manrope = Manrope({ subsets: ["latin"], display: "swap" });

/** Body / tables / navigation, then headings / big numbers (guide §1). */
export const daylightFonts = {
  body: `${inter.style.fontFamily}, Arial, sans-serif`,
  heading: `${manrope.style.fontFamily}, Arial, sans-serif`,
} as const;

export interface DaylightPalette {
  canvas: string;
  surface: string;
  sky: string;
  brand: string;
  action: string;
  actionHover: string;
  skySoft: string;
  mint: string;
  success: string;
  amber: string;
  warning: string;
  dangerSoft: string;
  danger: string;
  text: string;
  muted: string;
  /** Secondary text on the full-colour KPI cards. */
  cardMuted: string;
  border: string;
  inputBorder: string;
  /** Slightly darker borders for the coloured KPI cards. */
  borderSky: string;
  borderMint: string;
  borderAmber: string;
  borderDanger: string;
  /** Hover fill for neutral controls / nav links. */
  hover: string;
  shadow: string;
  /** Series colours for the two mining pools. */
  poolLuxor: string;
  poolBraiins: string;
}

const light: DaylightPalette = {
  canvas: "#F5F8FA",
  surface: "#FFFFFF",
  sky: "#38B6FF",
  brand: "#2491CF",
  action: "#1675A9",
  actionHover: "#126591",
  skySoft: "#EAF6FE",
  mint: "#E9F7F1",
  success: "#257451",
  amber: "#FFF4DE",
  warning: "#8A5A13",
  dangerSoft: "#FFF0EF",
  danger: "#AD4840",
  text: "#414D58",
  muted: "#64727C",
  cardMuted: "#596873",
  border: "#DFE7ED",
  inputBorder: "#82939E",
  borderSky: "#CEE5F3",
  borderMint: "#CFE8DC",
  borderAmber: "#EEDDBB",
  borderDanger: "#E5B0AB",
  hover: "#F0F6F9",
  shadow: "0 4px 20px rgba(70,100,120,.035)",
  poolLuxor: "#1675A9",
  poolBraiins: "#E0A030",
};

const dark: DaylightPalette = {
  canvas: "#121212",
  surface: "#1E1E1E",
  sky: "#38B6FF",
  brand: "#4BB3F0",
  action: "#5CB8E8",
  actionHover: "#7CC8EF",
  skySoft: "rgba(56,182,255,0.14)",
  mint: "rgba(80,190,140,0.14)",
  success: "#5FD3A0",
  amber: "rgba(255,190,80,0.14)",
  warning: "#F0C070",
  dangerSoft: "rgba(240,138,130,0.14)",
  danger: "#F08A82",
  text: "#E6EBEF",
  muted: "#9AA7B0",
  cardMuted: "#B4C0C8",
  border: "rgba(255,255,255,0.12)",
  inputBorder: "rgba(255,255,255,0.3)",
  borderSky: "rgba(56,182,255,0.25)",
  borderMint: "rgba(80,190,140,0.25)",
  borderAmber: "rgba(255,190,80,0.25)",
  borderDanger: "rgba(240,138,130,0.35)",
  hover: "rgba(255,255,255,0.06)",
  shadow: "0 4px 20px rgba(0,0,0,0.35)",
  poolLuxor: "#5CB8E8",
  poolBraiins: "#F0B34A",
};

export const RADIUS_CARD = "16px";
export const RADIUS_CONTROL = "8px";

/** Header heights: 76px top bar, 72px mobile top bar (guide §6 / preview). */
export const HEADER_HEIGHT = { desktop: 76, mobile: 72 } as const;

/** Media queries from the guide's responsive rules (§7). */
export const MQ = {
  /** Below 700px: mobile top bar + bottom navigation. */
  mobile: "@media (max-width:699.95px)",
  /** 700px and up: desktop top bar. */
  desktop: "@media (min-width:700px)",
  /** Below 960px: KPI cards go two columns, major panels stack. */
  stack: "@media (max-width:959.95px)",
  /** Below 1190px: tighter paddings / narrower side column. */
  compact: "@media (max-width:1190px)",
} as const;

/**
 * Sidebar width per breakpoint: 224px on large desktop, narrower on tablets,
 * gone below 700px (mobile top bar + bottom navigation take over).
 * `prop` is the CSS property the width drives (sidebar `width`, top bar
 * `left`, body `paddingLeft`).
 */
export const sidebarWidthStyles = (prop: string) => ({
  [prop]: "224px",
  [MQ.compact]: { [prop]: "200px" },
  [MQ.stack]: { [prop]: "180px" },
  [MQ.mobile]: { [prop]: "0px" },
});

/** Focus state from the guide: 3px solid action outline, 3px offset. */
export const focusRing = (color: string) => ({
  outline: `3px solid ${color}`,
  outlineOffset: "3px",
});

export function useDaylight() {
  const { darkMode } = useTheme();
  const d = darkMode ? dark : light;
  return { d, darkMode, fonts: daylightFonts };
}
