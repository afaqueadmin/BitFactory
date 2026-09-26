"use client";

import React, { useEffect, useState } from "react";
import { Box, Typography, alpha, useTheme } from "@mui/material";
import LockClockIcon from "@mui/icons-material/LockClock";

const FREEZE_HOURS = 24;
const FREEZE_MS = FREEZE_HOURS * 60 * 60 * 1000;
const TICK_MS = 30_000;

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (minutes === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Freeze window is derived from reviewedAt (the moment an admin approves) +
 * 24h - approval no longer pushes to Luxor immediately, so this window is
 * the client-facing stand-in for "your account is mid-change, expect a
 * short delay while our team updates it on Luxor."
 */
export function useFreezeRemaining(reviewedAt: string | null | undefined) {
  const endTime = reviewedAt
    ? new Date(reviewedAt).getTime() + FREEZE_MS
    : null;
  const [remaining, setRemaining] = useState(() =>
    endTime ? endTime - Date.now() : 0,
  );

  useEffect(() => {
    if (!endTime) return;
    setRemaining(endTime - Date.now());
    const interval = setInterval(() => {
      setRemaining(endTime - Date.now());
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [endTime]);

  if (!endTime || remaining <= 0) {
    return { isFrozen: false as const, label: null as string | null };
  }
  return {
    isFrozen: true as const,
    label: `Payout security freeze — ${formatRemaining(remaining)} remaining`,
  };
}

/**
 * Self-contained "payouts frozen" badge for an APPROVED wallet change
 * request - renders nothing once the 24h window has passed. Each usage
 * site is its own component instance (one per list row), so the ticking
 * useFreezeRemaining hook above stays rules-of-hooks-safe even though the
 * parent renders a variable number of rows.
 */
export default function FreezeCountdown({
  reviewedAt,
  dense = false,
}: {
  reviewedAt: string | null | undefined;
  dense?: boolean;
}) {
  const theme = useTheme();
  const { isFrozen, label } = useFreezeRemaining(reviewedAt);

  if (!isFrozen || !label) return null;

  return (
    <Box
      sx={{
        mt: dense ? 0.5 : 1,
        p: dense ? 0.5 : 1,
        borderRadius: 1.5,
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        backgroundColor: alpha(theme.palette.info.main, 0.1),
        border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
      }}
    >
      <LockClockIcon
        sx={{ fontSize: dense ? 13 : 15, color: "info.main", flexShrink: 0 }}
      />
      <Typography
        variant="caption"
        color="info.main"
        sx={{ fontWeight: 600, fontSize: dense ? "0.68rem" : undefined }}
      >
        {label}
      </Typography>
    </Box>
  );
}
