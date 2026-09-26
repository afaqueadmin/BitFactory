// src/components/daylight/StatCard.tsx
"use client";

/**
 * StatCard - Daylight KPI card (guide §4).
 *
 * Full soft-blue / soft-mint / soft-amber background, no gradient. Label and
 * icon on top, big Manrope value, small footnote underneath.
 */

import React from "react";
import { Box, Skeleton, Typography } from "@mui/material";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

export type StatCardTone = "sky" | "mint" | "amber" | "danger";

export interface StatCardProps {
  title: string;
  value: string | number;
  /** Small trailing unit, e.g. "days". */
  unit?: string;
  /** Footnote under the value. */
  caption?: string;
  tone: StatCardTone;
  icon: React.ReactNode;
  isLoading?: boolean;
  /** Overrides the value's default text colour, e.g. success/danger for a
   * signed delta (24h change) where the number itself carries meaning. */
  valueColor?: string;
}

export default function StatCard({
  title,
  value,
  unit,
  caption,
  tone,
  icon,
  isLoading = false,
  valueColor,
}: StatCardProps) {
  const { d, fonts } = useDaylight();

  const toneStyles = {
    sky: { bg: d.skySoft, border: d.borderSky, icon: d.action },
    mint: { bg: d.mint, border: d.borderMint, icon: d.success },
    amber: { bg: d.amber, border: d.borderAmber, icon: d.warning },
    danger: { bg: d.dangerSoft, border: d.borderDanger, icon: d.danger },
  }[tone];

  return (
    <Box
      role="article"
      aria-label={title}
      sx={{
        minWidth: 0,
        height: "100%",
        bgcolor: toneStyles.bg,
        border: `1px solid ${toneStyles.border}`,
        borderRadius: RADIUS_CARD,
        boxShadow: d.shadow,
        p: { xs: "15px 13px", sm: "19px 20px" },
        fontFamily: fonts.body,
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 1,
          fontSize: { xs: 11, sm: 12 },
          color: d.cardMuted,
        }}
      >
        <span>{title}</span>
        <Box
          aria-hidden
          sx={{
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            width: { xs: 23, sm: 29 },
            height: { xs: 23, sm: 29 },
            borderRadius: { xs: "6px", sm: "8px" },
            bgcolor: d.surface,
            color: toneStyles.icon,
            "& svg": { fontSize: { xs: 13, sm: 16 } },
          }}
        >
          {icon}
        </Box>
      </Box>

      {isLoading ? (
        <Skeleton
          variant="rounded"
          sx={{ mt: "9px", mb: "5px", height: 32, width: "70%" }}
        />
      ) : (
        <Typography
          component="p"
          sx={{
            fontFamily: fonts.heading,
            fontWeight: 750,
            fontSize: { xs: 24, sm: 28 },
            lineHeight: 1.4,
            letterSpacing: { xs: "-.8px", sm: "-1px" },
            color: valueColor || d.text,
            m: "9px 0 5px",
            fontVariantNumeric: "tabular-nums",
            overflowWrap: "anywhere",
          }}
        >
          {value}
          {unit && (
            <Box
              component="span"
              sx={{
                fontFamily: fonts.body,
                fontWeight: 500,
                fontSize: { xs: 11, sm: 13 },
                letterSpacing: 0,
                ml: "5px",
                color: d.cardMuted,
              }}
            >
              {unit}
            </Box>
          )}
        </Typography>
      )}

      {caption && (
        <Box sx={{ fontSize: { xs: 10, sm: 11 }, color: d.cardMuted }}>
          {caption}
        </Box>
      )}
    </Box>
  );
}
