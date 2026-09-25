// src/components/daylight/Segmented.tsx
"use client";

/** Daylight segmented control - a small track of 2-3 mutually exclusive
 * options (e.g. Daily / Monthly, Total / Luxor / Braiins). */

import React from "react";
import { Box } from "@mui/material";
import { MQ, focusRing, useDaylight } from "@/lib/daylight";

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  title?: string;
}

export default function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel: string;
}) {
  const { d, fonts } = useDaylight();

  return (
    <Box
      role="group"
      aria-label={ariaLabel}
      sx={{
        display: "inline-flex",
        gap: "3px",
        p: "3px",
        border: `1px solid ${d.border}`,
        borderRadius: "8px",
        bgcolor: d.canvas,
      }}
    >
      {options.map((o) => {
        const selected = value === o.id;
        return (
          <Box
            component="button"
            type="button"
            key={o.id}
            title={o.title}
            aria-pressed={selected}
            onClick={() => onChange(o.id)}
            sx={{
              border: 0,
              borderRadius: "5px",
              cursor: "pointer",
              px: "12px",
              minHeight: 32,
              fontFamily: fonts.body,
              fontSize: 11,
              fontWeight: selected ? 650 : 500,
              bgcolor: selected ? d.surface : "transparent",
              color: selected ? d.action : d.muted,
              boxShadow: selected ? `0 1px 4px ${d.border}` : "none",
              "&:hover": { color: d.action },
              "&:focus-visible": focusRing(d.action),
              [MQ.mobile]: { minHeight: 44, px: "14px" },
            }}
          >
            {o.label}
          </Box>
        );
      })}
    </Box>
  );
}
