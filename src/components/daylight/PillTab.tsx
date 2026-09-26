// src/components/daylight/PillTab.tsx
"use client";

/** Daylight pill button for a scrollable row of filters (pool selector, miner
 * filter, ...). Soft-blue when active, with an optional colour dot. */

import React from "react";
import { Box } from "@mui/material";
import { MQ, focusRing, useDaylight } from "@/lib/daylight";

export default function PillTab({
  active,
  onClick,
  title,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  dot?: string;
  children: React.ReactNode;
}) {
  const { d, fonts } = useDaylight();
  return (
    <Box
      component="button"
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        border: 0,
        borderRadius: "7px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        px: "12px",
        minHeight: 40,
        fontFamily: fonts.body,
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        bgcolor: active ? d.skySoft : "transparent",
        color: active ? d.action : d.muted,
        "&:hover": { bgcolor: active ? d.skySoft : d.hover },
        "&:focus-visible": focusRing(d.action),
        [MQ.mobile]: { minHeight: 44, px: "10px", fontSize: 10 },
      }}
    >
      {dot && (
        <Box
          component="span"
          aria-hidden
          sx={{ width: 7, height: 7, borderRadius: "2px", bgcolor: dot }}
        />
      )}
      {children}
    </Box>
  );
}
