// src/components/daylight/FactoryStatusCard.tsx
"use client";

/**
 * FactoryStatusCard - Daylight version of the "Factory Status" fleet card.
 *
 * Same data as HostedMinersCard (running / inactive workers plus the per-pool
 * breakdown), laid out top to bottom for the narrow dashboard side column:
 * uptime ring + status summary, running / inactive stat tiles, per-pool
 * progress rows and a "view all miners" link.
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
    if (total === 0) {
      return { label: "No workers", bg: d.hover, color: d.muted };
    }
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
            sx={{ fontSize: { xs: 11, sm: 12 }, color: d.muted, mt: "4px" }}
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
                width: 36,
                height: 36,
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
                <CircularProgress size={16} sx={{ color: d.action }} />
              ) : (
                <RefreshIcon sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Body */}
      <Box sx={{ p: { xs: "18px", sm: "20px 24px 22px" }, flex: 1 }}>
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
              fontSize: 12,
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
            {/* Uptime ring + summary */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <Box
                role="img"
                aria-label={`${runningCount} of ${total} workers running`}
                sx={{
                  position: "relative",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  width: 88,
                  height: 88,
                  borderRadius: "50%",
                  background:
                    total > 0
                      ? `conic-gradient(${ringColor} 0 ${runningPct}%, ${ringTrack} ${runningPct}% 100%)`
                      : d.border,
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    inset: "8px",
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
                    lineHeight: 1.2,
                  }}
                >
                  <Box
                    component="strong"
                    sx={{
                      display: "block",
                      fontFamily: fonts.heading,
                      fontWeight: 750,
                      fontSize: 20,
                      color: d.text,
                    }}
                  >
                    {total > 0 ? `${Math.round(runningPct)}%` : "—"}
                  </Box>
                  online
                </Box>
              </Box>

              <Box sx={{ minWidth: 0 }}>
                <Box
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    px: "10px",
                    py: "4px",
                    borderRadius: "20px",
                    bgcolor: status.bg,
                    color: status.color,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      bgcolor: "currentColor",
                    }}
                  />
                  {status.label}
                </Box>
                <Typography
                  sx={{
                    mt: "8px",
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: d.muted,
                  }}
                >
                  <Box component="b" sx={{ color: d.text, fontWeight: 650 }}>
                    {runningCount}
                  </Box>{" "}
                  of{" "}
                  <Box component="b" sx={{ color: d.text, fontWeight: 650 }}>
                    {total}
                  </Box>{" "}
                  workers running
                </Typography>
              </Box>
            </Box>

            {/* Running / inactive tiles */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                mt: "20px",
              }}
            >
              <StatTile
                label="Running"
                value={runningCount}
                dot={d.success}
                valueColor={d.text}
              />
              <StatTile
                label="Inactive"
                value={errorCount}
                dot={d.danger}
                valueColor={errorCount > 0 ? d.danger : d.text}
                highlight={errorCount > 0}
              />
            </Box>

            {/* Pool breakdown */}
            {(pools.length > 0 || showTotalMiners) && (
              <Box sx={{ mt: "22px" }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    mb: "12px",
                  }}
                >
                  <Typography
                    component="h3"
                    sx={{
                      fontSize: 11,
                      fontWeight: 650,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      color: d.muted,
                    }}
                  >
                    By pool
                  </Typography>
                  {showTotalMiners && (
                    <Typography sx={{ fontSize: 12, color: d.muted }}>
                      <Box
                        component="b"
                        sx={{ color: d.text, fontWeight: 650 }}
                      >
                        {totalMinerCount}
                      </Box>{" "}
                      miners
                    </Typography>
                  )}
                </Box>

                <Box
                  sx={{ display: "flex", flexDirection: "column", gap: "14px" }}
                >
                  {pools.map((pool) => (
                    <PoolRow
                      key={pool.key}
                      name={pool.name}
                      color={pool.color}
                      active={pool.stats!.activeWorkers}
                      inactive={pool.stats!.inactiveWorkers}
                    />
                  ))}
                </Box>
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
          fontSize: { xs: 12, sm: 13 },
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

function StatTile({
  label,
  value,
  dot,
  valueColor,
  highlight = false,
}: {
  label: string;
  value: number;
  dot: string;
  valueColor: string;
  highlight?: boolean;
}) {
  const { d, fonts } = useDaylight();
  return (
    <Box
      sx={{
        p: "10px 12px",
        borderRadius: "10px",
        border: `1px solid ${highlight ? d.borderDanger : d.border}`,
        bgcolor: highlight ? d.dangerSoft : d.canvas,
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: 11,
          color: d.muted,
        }}
      >
        <Box
          component="span"
          aria-hidden
          sx={{ width: 7, height: 7, borderRadius: "2px", bgcolor: dot }}
        />
        {label}
      </Box>
      <Box
        sx={{
          mt: "4px",
          fontFamily: fonts.heading,
          fontWeight: 750,
          fontSize: 20,
          lineHeight: 1.2,
          color: valueColor,
        }}
      >
        {value}
      </Box>
    </Box>
  );
}

function PoolRow({
  name,
  color,
  active,
  inactive,
}: {
  name: string;
  color: string;
  active: number;
  inactive: number;
}) {
  const { d } = useDaylight();
  const poolTotal = active + inactive;
  const pct = poolTotal > 0 ? (active / poolTotal) * 100 : 0;

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: 12,
          mb: "6px",
        }}
      >
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
        <Box component="span" sx={{ fontWeight: 600, color: d.text }}>
          {name}
        </Box>
        <Box component="span" sx={{ ml: "auto", color: d.muted }}>
          <Box component="b" sx={{ color: d.text, fontWeight: 650 }}>
            {active}
          </Box>
          /{poolTotal} active
          {inactive > 0 && (
            <Box component="span" sx={{ color: d.danger, fontWeight: 600 }}>
              {" "}
              · {inactive} down
            </Box>
          )}
        </Box>
      </Box>
      <Box
        role="progressbar"
        aria-label={`${name}: ${active} of ${poolTotal} workers active`}
        aria-valuemin={0}
        aria-valuemax={poolTotal}
        aria-valuenow={active}
        sx={{
          height: 6,
          borderRadius: "3px",
          bgcolor: inactive > 0 ? d.dangerSoft : d.border,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: "3px",
            bgcolor: color,
          }}
        />
      </Box>
    </Box>
  );
}
