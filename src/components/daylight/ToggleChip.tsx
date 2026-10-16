// src/components/daylight/ToggleChip.tsx
"use client";

/** Daylight on/off chip - a pill button with a built-in mini switch, for
 * opting extra detail in or out of a view (e.g. extra table rows). */

import React from "react";
import { Box } from "@mui/material";
import { MQ, focusRing, useDaylight } from "@/lib/daylight";

export default function ToggleChip({
  checked,
  onChange,
  label,
  title,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  title?: string;
}) {
  const { d, fonts } = useDaylight();

  return (
    <Box
      component="button"
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "10px",
        minHeight: 34,
        pl: "8px",
        pr: "14px",
        borderRadius: "999px",
        border: `1px solid ${checked ? d.borderSky : d.border}`,
        bgcolor: checked ? d.skySoft : d.surface,
        color: checked ? d.action : d.text,
        fontFamily: fonts.body,
        fontSize: 12,
        fontWeight: checked ? 650 : 550,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition:
          "background-color .18s ease, border-color .18s ease, color .18s ease",
        "&:hover": {
          borderColor: checked ? d.action : d.inputBorder,
          bgcolor: checked ? d.skySoft : d.hover,
        },
        "&:focus-visible": focusRing(d.action),
        [MQ.mobile]: { minHeight: 44 },
      }}
    >
      {/* Mini switch track + knob */}
      <Box
        aria-hidden
        sx={{
          position: "relative",
          flexShrink: 0,
          width: 30,
          height: 18,
          borderRadius: "999px",
          bgcolor: checked ? d.action : d.border,
          transition: "background-color .18s ease",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: 2,
            left: checked ? 14 : 2,
            width: 14,
            height: 14,
            borderRadius: "50%",
            bgcolor: d.surface,
            boxShadow: "0 1px 3px rgba(0,0,0,.25)",
            transition: "left .18s ease",
          }}
        />
      </Box>
      {label}
    </Box>
  );
}
