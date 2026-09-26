// src/components/daylight/FactoryStatusCard.tsx
"use client";

/**
 * FactoryStatusCard - Daylight version of the "Factory Status" fleet card.
 *
 * Same data as HostedMinersCard (running / inactive workers plus the per-pool
 * breakdown), laid out like the Daylight "fleet health" card: status ring,
 * legend rows, pool rows and a "view all miners" link.
 */

import React, { useState } from "react";
import {
  Box,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import Link from "next/link";
import { RADIUS_CARD, focusRing, useDaylight } from "@/lib/daylight";

export interface FactoryStatusCardProps {
  runningCount: number;
  errorCount: number;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void | Promise<void>;
  activePoolNames?: string[];
  totalMinerCount?: number;
  poolBreakdown?: {
    luxor: { activeWorkers: number; inactiveWorkers: number };
    braiins: { activeWorkers: number; inactiveWorkers: number };
  };
}

export default function FactoryStatusCard({
  runningCount,
  errorCount,
  loading = false,
  error = null,
  onRefresh,
  activePoolNames = [],
  totalMinerCount,
  poolBreakdown,
}: FactoryStatusCardProps) {
  const { d, fonts } = useDaylight();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setIsRefreshing(false);
    }
  };

  const total = runningCount + errorCount;
  const runningPct = total > 0 ? (runningCount / total) * 100 : 0;
  const allHealthy = total > 0 && errorCount === 0;

  const ringColor = d.success;
  const ringTrack = errorCount > 0 ? d.danger : d.border;

  const status = (() => {
    if (total === 0) return null;
    if (allHealthy) {
      return { label: "All running", bg: d.mint, color: d.success };
    }
    return {
      label: `${errorCount} inactive`,
      bg: d.dangerSoft,
      color: d.danger,
    };
  })();

  const pools = [
    {
      key: "luxor",
      name: "Luxor",
      color: d.poolLuxor,
      stats: poolBreakdown?.luxor,
    },
    {
      key: "braiins",
      name: "Braiins",
      color: d.poolBraiins,
      stats: poolBreakdown?.braiins,
    },
  ].filter((p) => activePoolNames.includes(p.name) && p.stats);

  const showTotalMiners =
    typeof totalMinerCount === "number" &&
    activePoolNames.includes("Luxor") &&
    activePoolNames.includes("Braiins");

  return (
    <Box
      component="section"
      role="region"
      aria-label="Factory Status"
      sx={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        bgcolor: d.surface,
        border: `1px solid ${d.border}`,
        borderRadius: RADIUS_CARD,
        boxShadow: d.shadow,
        fontFamily: fonts.body,
        color: d.text,
      }}
    >
      {/* Head */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 1.5,
          p: { xs: "19px 18px 0", sm: "23px 24px 0" },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h2"
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 750,
              fontSize: { xs: 16, sm: 18 },
              letterSpacing: "-.035em",
              color: d.text,
            }}
          >
            Factory Status
          </Typography>
          <Typography
            sx={{ fontSize: { xs: 10, sm: 11 }, color: d.muted, mt: "4px" }}
          >
            Live worker health across your pools
          </Typography>
        </Box>
        <Tooltip title="Refresh worker data">
          <span>
            <IconButton
              onClick={handleRefresh}
              disabled={loading || isRefreshing}
              aria-label="Refresh worker data"
              sx={{
                width: 40,
                height: 40,
                flexShrink: 0,
                border: `1px solid ${d.border}`,
                borderRadius: "10px",
                bgcolor: d.surface,
                color: d.muted,
                "&:hover": { bgcolor: d.hover },
                "&:focus-visible": focusRing(d.action),
              }}
            >
              {isRefreshing ? (
                <CircularProgress size={18} sx={{ color: d.action }} />
              ) : (
                <RefreshIcon fontSize="small" />
              )}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Body */}
      <Box sx={{ p: { xs: "18px", sm: "20px 24px" }, flex: 1 }}>
        {error && (
          <Box
            role="alert"
            sx={{
              mb: 2,
              p: "12px",
              border: `1px solid ${d.borderDanger}`,
              borderRadius: "8px",
              bgcolor: d.dangerSoft,
              color: d.danger,
              fontSize: 11,
            }}
          >
            {error}
          </Box>
        )}

        {loading ? (
          <Box
            sx={{ display: "flex", justifyContent: "center", py: 4 }}
            role="status"
            aria-label="Loading worker status"
          >
            <CircularProgress size={32} sx={{ color: d.action }} />
          </Box>
        ) : (
          <>
            {/* Ring + headline */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: { xs: "12px", sm: "20px" },
                mb: "23px",
              }}
            >
              <Box
                role="img"
                aria-label={`${runningCount} of ${total} miners running`}
                sx={{
                  position: "relative",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  width: { xs: 83, sm: 102 },
                  height: { xs: 83, sm: 102 },
                  borderRadius: "50%",
                  background:
                    total > 0
                      ? `conic-gradient(${ringColor} 0 ${runningPct}%, ${ringTrack} ${runningPct}% 100%)`
                      : d.border,
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    inset: "9px",
                    borderRadius: "50%",
                    background: d.surface,
                  },
                }}
              >
                <Box
                  sx={{
                    position: "relative",
                    textAlign: "center",
                    fontSize: 10,
                    color: d.muted,
                  }}
                >
                  <Box
                    component="strong"
                    sx={{
                      display: "block",
                      fontFamily: fonts.heading,
                      fontWeight: 750,
                      fontSize: { xs: 23, sm: 26 },
                      color: d.text,
                      lineHeight: 1.2,
                    }}
                  >
                    {runningCount}
                  </Box>
                  running
                </Box>
              </Box>

              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ fontSize: 11, color: d.muted }}>
                  <Box
                    component="strong"
                    sx={{
                      display: "block",
                      fontFamily: fonts.heading,
                      fontWeight: 700,
                      fontSize: { xs: 18, sm: 22 },
                      color: d.text,
                    }}
                  >
                    {total}
                  </Box>
                  total workers
                </Box>
                {status && (
                  <Box
                    component="span"
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      mt: "8px",
                      px: "9px",
                      py: "4px",
                      borderRadius: "20px",
                      bgcolor: status.bg,
                      color: status.color,
                      fontSize: { xs: 11, sm: 10 },
                      fontWeight: 550,
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        bgcolor: "currentColor",
                      }}
                    />
                    {status.label}
                  </Box>
                )}
              </Box>
            </Box>

            {/* Legend rows */}
            <LegendRow
              color={ringColor}
              label="Running"
              value={runningCount}
              valueColor={d.text}
            />
            <LegendRow
              color={d.danger}
              label={`Error${errorCount !== 1 ? "s" : ""} / inactive`}
              value={errorCount}
              valueColor={errorCount > 0 ? d.danger : d.text}
            />

            {/* Pool breakdown */}
            {(pools.length > 0 || showTotalMiners) && (
              <Box
                sx={{
                  mt: "18px",
                  pt: "6px",
                  borderTop: `1px solid ${d.border}`,
                }}
              >
                {showTotalMiners && (
                  <LegendRow
                    label="Total miners"
                    value={totalMinerCount as number}
                    valueColor={d.text}
                  />
                )}
                {pools.map((pool) => (
                  <LegendRow
                    key={pool.key}
                    color={pool.color}
                    label={pool.name}
                    value={`${pool.stats!.activeWorkers} active${
                      pool.stats!.inactiveWorkers > 0
                        ? ` · ${pool.stats!.inactiveWorkers} inactive`
                        : ""
                    }`}
                    valueColor={
                      pool.stats!.inactiveWorkers > 0 ? d.danger : d.text
                    }
                  />
                ))}
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Footer link */}
      <Box
        component={Link}
        href="/miners"
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          minHeight: 44,
          p: { xs: "14px 18px", sm: "16px 24px" },
          borderTop: `1px solid ${d.border}`,
          borderRadius: `0 0 ${RADIUS_CARD} ${RADIUS_CARD}`,
          fontSize: { xs: 11, sm: 12 },
          fontWeight: 600,
          color: d.action,
          textDecoration: "none",
          "&:hover": { color: d.actionHover, bgcolor: d.hover },
          "&:focus-visible": {
            ...focusRing(d.action),
            outlineOffset: "-3px",
          },
        }}
      >
        View all miners
        <ArrowForwardIcon sx={{ fontSize: 16 }} aria-hidden />
      </Box>
    </Box>
  );
}

function LegendRow({
  color,
  label,
  value,
  valueColor,
}: {
  color?: string;
  label: string;
  value: React.ReactNode;
  valueColor: string;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: { xs: 10, sm: 11 },
        my: "12px",
      }}
    >
      {color && (
        <Box
          component="span"
          aria-hidden
          sx={{
            width: 7,
            height: 7,
            borderRadius: "2px",
            bgcolor: color,
            flexShrink: 0,
          }}
        />
      )}
      <span>{label}</span>
      <Box
        component="b"
        sx={{ ml: "auto", fontWeight: 650, color: valueColor }}
      >
        {value}
      </Box>
    </Box>
  );
}
