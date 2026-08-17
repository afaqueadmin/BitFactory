"use client";

/**
 * Hashrate & Shares Efficiency chart.
 *
 * Renders a client's own pool history: hashrate as a filled area on the left
 * axis, and — for Luxor only — share efficiency as a dashed line on the right
 * axis. Braiins publishes neither efficiency nor sub-daily points, so its
 * view is hashrate-only and the caveat is stated under the chart rather than
 * silently producing a flat line.
 *
 * Periods are calendar buckets matching Luxor's watcher (1D = "12 Aug",
 * 1W = Mon-to-Sun "10 Aug - 12 Aug"), resolved in the browser's timezone.
 * A custom date range is available and clears the period selection.
 *
 * Data comes from /api/miners/hashrate-history, which scopes to the logged-in
 * user unless a privileged userId is passed.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Box,
  Paper,
  Typography,
  Button,
  ButtonBase,
  IconButton,
  TextField,
  CircularProgress,
  Alert,
  Tooltip as MuiTooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
  useMediaQuery,
  alpha,
} from "@mui/material";
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ShowChart as ShowChartIcon,
  TableChart as TableChartIcon,
  Download as DownloadIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  DateRange as DateRangeIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { useHashrateHistory } from "@/hooks/useHashrateHistory";
import {
  PERIODS,
  Period,
  bucketWindow,
  formatRangeLabel,
  formatTimestamp,
  localOffsetLabel,
  resolveHashrateUnit,
} from "@/lib/hashrateWindows";

/**
 * Chart styling mirrors Luxor's watcher, read straight off its SVG on
 * 2026-08-12 rather than eyeballed: a vertical gradient fill at 0.15 → 0.01
 * opacity, a 2px solid hashrate line, a 2px dashed (4.5) efficiency line, and
 * a horizontal-only dashed grid (#383A42, "4 2"). Its accent is yellow
 * (#f0bb31); ours is the pool's own colour instead.
 */
const LUXOR_COLOR = "#1565C0";
const BRAIINS_COLOR = "#FFA500";
const EFFICIENCY_COLOR = "#f03131"; // Luxor's exact efficiency red
const UPTIME_COLOR = "#9c27b0"; // matches the wallet Revenue (24 Hours) card
const GRID_DARK = "#383A42"; // Luxor's exact grid colour
const GRID_LIGHT = "#E0E2E7";

interface HashrateHistoryChartProps {
  /**
   * Which pool to display. Mirrors the client miners page toggle. Defaults to
   * "total" for the admin and franchise views, which have no pool toggle of
   * their own — a customer on a single pool still renders correctly, since
   * the styling keys off how many series actually have data.
   */
  poolMode?: "total" | "luxor" | "braiins";
  /** Privileged: admins and the owning franchisee. Omit for own data. */
  userId?: string;
  /**
   * Scope to a single miner's worker-level series instead of the whole
   * subaccount — same chart, reads from /api/miners/[minerId]/hashrate-history.
   * Worker-level data has no uptime and, for Braiins miners, no history at
   * all (neither has any endpoint), so those notes are tailored below.
   */
  minerId?: string;
  height?: number;
}

interface ChartRow {
  t: number;
  luxor: number | null;
  braiins: number | null;
  efficiency: number | null;
  uptime: number | null;
}

/** Legend-toggleable series, matching each series' dataKey. */
type SeriesKey = "luxor" | "braiins" | "efficiency" | "uptime";

/** yyyy-MM-dd in local time, for <input type="date">. */
const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Re-anchor a daily bucket to the local start of the day it represents.
 *
 * The pools timestamp daily figures at UTC midnight, but the chart's axis and
 * its calendar buckets are in the viewer's timezone. Plotted raw, a daily
 * series starts one UTC offset into the window — at GMT+5 the 10 Aug uptime
 * point landed at 05:00 on 10 Aug, leaving a visible gap before the line
 * began. A daily value is an aggregate for a date, not an instant, so it
 * belongs at the start of that date as the viewer reckons it.
 */
const toLocalDayStart = (utcMs: number) => {
  const d = new Date(utcMs);
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
  ).getTime();
};

export default function HashrateHistoryChart({
  poolMode = "total",
  userId,
  minerId,
  height = 380,
}: HashrateHistoryChartProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isDark = theme.palette.mode === "dark";

  const [period, setPeriod] = useState<Period | null>("1W");
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Custom range. Non-null `customRange` means the period buttons are off.
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [customRange, setCustomRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Re-resolved every minute so the live bucket keeps up with the clock (and
   * rolls over at midnight) without the component re-rendering constantly.
   */
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const window_ = useMemo(() => {
    if (customRange) return customRange;
    return bucketWindow(period ?? "1W", offset, new Date(clock));
  }, [customRange, period, offset, clock]);

  // Live = the window runs up to now, so it should keep refreshing.
  const isLive = !customRange && offset === 0;

  const { history, isLoading, isFetching, isError, error } = useHashrateHistory(
    {
      start: window_.start,
      end: window_.end,
      period: customRange ? null : period,
      isLive,
      userId,
      minerId,
    },
  );

  const selectPeriod = (next: Period) => {
    setPeriod(next);
    setOffset(0);
    setCustomRange(null);
    setShowRangePicker(false);
  };

  const applyCustomRange = () => {
    if (!draftFrom || !draftTo) return;
    const start = new Date(`${draftFrom}T00:00:00`);
    // Inclusive end date: run to the end of the chosen day.
    const end = new Date(`${draftTo}T00:00:00`);
    end.setDate(end.getDate() + 1);
    if (!(start < end)) return;

    setCustomRange({ start, end: end > new Date() ? new Date() : end });
    setPeriod(null);
    setOffset(0);
  };

  const clearCustomRange = () => {
    setCustomRange(null);
    setShowRangePicker(false);
    setPeriod("1W");
    setOffset(0);
  };

  const showLuxor = poolMode === "total" || poolMode === "luxor";
  const showBraiins = poolMode === "total" || poolMode === "braiins";

  const luxorSeries = history?.pools.luxor;
  const braiinsSeries = history?.pools.braiins;

  /**
   * Merge both pools onto a shared time axis. The two pools tick at different
   * rates (Luxor down to 5m, Braiins daily), so rows carry nulls where a pool
   * has no sample and the lines use connectNulls — no values are invented.
   */
  const chartData: ChartRow[] = useMemo(() => {
    const rows = new Map<number, ChartRow>();

    const touch = (t: number): ChartRow => {
      let row = rows.get(t);
      if (!row) {
        row = { t, luxor: null, braiins: null, efficiency: null, uptime: null };
        rows.set(t, row);
      }
      return row;
    };

    if (showLuxor && luxorSeries?.available) {
      // Hashrate/efficiency are only daily on the coarser periods; 5m and 1h
      // points are real instants and must not be re-anchored.
      const luxorIsDaily = luxorSeries.granularity === "1d";
      for (const point of luxorSeries.points) {
        const row = touch(luxorIsDaily ? toLocalDayStart(point.t) : point.t);
        row.luxor = point.hashrate;
        row.efficiency = point.efficiency;
      }
      // Uptime is always daily, whatever tick the rest of the chart uses, so
      // it lands on its own rows and connectNulls draws it across the finer
      // series.
      for (const point of luxorSeries.uptimePoints) {
        touch(toLocalDayStart(point.t)).uptime = point.uptime;
      }
    }

    if (showBraiins && braiinsSeries?.available) {
      // Braiins only ever reports daily points.
      for (const point of braiinsSeries.points) {
        touch(toLocalDayStart(point.t)).braiins = point.hashrate;
      }
    }

    return Array.from(rows.values()).sort((a, b) => a.t - b.t);
  }, [showLuxor, showBraiins, luxorSeries, braiinsSeries]);

  /**
   * Series switched off by clicking the legend. Keyed by dataKey. "Available"
   * below still means the data exists; "visible" additionally means the user
   * hasn't hidden it.
   */
  const [hiddenSeries, setHiddenSeries] = useState<Set<SeriesKey>>(new Set());

  const toggleSeries = useCallback((key: SeriesKey) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const isHidden = (key: SeriesKey) => hiddenSeries.has(key);

  // Efficiency only ever comes from Luxor, and only when Luxor is on screen.
  const hasEfficiency =
    showLuxor &&
    !!luxorSeries?.available &&
    chartData.some((row) => row.efficiency != null);

  // Uptime likewise: Luxor-only, and absent on windows shorter than two days
  // because the pool serves it at a daily tick only.
  const hasUptime =
    showLuxor &&
    !!luxorSeries?.available &&
    chartData.some((row) => row.uptime != null);

  const hasLuxorHashrate = showLuxor && !!luxorSeries?.available;
  const hasBraiinsHashrate = showBraiins && !!braiinsSeries?.available;

  // What is actually drawn right now. The percentage series don't need
  // equivalents: they are rendered whenever available and switched off with
  // recharts' `hide`, which keeps their legend entry clickable.
  const showLuxorLine = hasLuxorHashrate && !isHidden("luxor");
  const showBraiinsLine = hasBraiinsHashrate && !isHidden("braiins");

  /**
   * The percentage axis keys off availability, not visibility: hidden series
   * stay mounted so their legend entry survives, and a mounted Line whose
   * yAxisId has no matching axis breaks the chart.
   */
  const hasPercentAxis = hasEfficiency || hasUptime;

  // Rescale the hashrate axis to whichever hashrate series are still visible,
  // so hiding one lets the other use the full height.
  const unit = useMemo(() => {
    const values = chartData.flatMap((row) =>
      [
        showLuxorLine ? row.luxor : null,
        showBraiinsLine ? row.braiins : null,
      ].filter((v): v is number => v != null && v > 0),
    );
    return resolveHashrateUnit(values.length ? Math.max(...values) : 0);
  }, [chartData, showLuxorLine, showBraiinsLine]);

  /**
   * The table lists every column the data supports; the legend toggle is a
   * chart control, so hiding a line there must not drop it from the table or
   * the CSV export. Hence its own availability-based single-series check.
   */
  const isSingleAvailableSeries =
    (hasLuxorHashrate ? 1 : 0) + (hasBraiinsHashrate ? 1 : 0) <= 1;

  /**
   * Legend entries, rendered as toggle buttons under the chart. Labels use
   * the availability-based check so they don't rename themselves when a
   * series is switched off.
   */
  const legendItems = (
    [
      hasLuxorHashrate && {
        key: "luxor" as SeriesKey,
        label: isSingleAvailableSeries
          ? `Hashrate (${unit.label})`
          : `Luxor (${unit.label})`,
        color: LUXOR_COLOR,
        dashed: false,
      },
      hasBraiinsHashrate && {
        key: "braiins" as SeriesKey,
        label: isSingleAvailableSeries
          ? `Hashrate (${unit.label})`
          : `Braiins (${unit.label})`,
        color: BRAIINS_COLOR,
        dashed: false,
      },
      hasEfficiency && {
        key: "efficiency" as SeriesKey,
        label: "Shares Efficiency",
        color: EFFICIENCY_COLOR,
        dashed: true,
      },
      hasUptime && {
        key: "uptime" as SeriesKey,
        label: "Uptime",
        color: UPTIME_COLOR,
        dashed: false,
      },
    ] as const
  ).filter(Boolean) as {
    key: SeriesKey;
    label: string;
    color: string;
    dashed: boolean;
  }[];

  /**
   * A line through fewer than two points draws nothing, so sparse series get
   * visible dots instead — the normal case for Braiins on a 1D window.
   */
  const sparseDot = (pointCount: number) =>
    pointCount > 0 && pointCount <= 2 ? { r: 3 } : false;

  /**
   * Explicit axis ticks on natural calendar boundaries, matching the watcher:
   * a 1D view is labelled per hour ("12 AM", "1 AM", …) and a 1W view per day
   * ("10 Aug", "11 Aug", "12 Aug") — both read off Luxor's own axis.
   *
   * Letting recharts choose positions from the raw samples instead produced
   * "00:00, 01:15, 02:30 …", because 5-minute points don't land on hours.
   * Ticks are clamped to the data's own extent, since the axis domain is
   * dataMin..dataMax and anything outside it would silently vanish.
   */
  const axis = useMemo(() => {
    const tickSize = history?.tickSize ?? "1d";
    const dataMin = chartData.length ? chartData[0].t : window_.start.getTime();
    const dataMax = chartData.length
      ? chartData[chartData.length - 1].t
      : window_.end.getTime();

    const spanDays = (dataMax - dataMin) / 86_400_000;
    const crossesYears =
      new Date(dataMin).getFullYear() !== new Date(dataMax).getFullYear() ||
      new Date(dataMin).getFullYear() !== new Date().getFullYear();

    const hourLabel = (t: number) => {
      const h = new Date(t).getHours();
      const suffix = h < 12 ? "AM" : "PM";
      return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
    };
    const dayLabel = (t: number) =>
      new Date(t).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      });
    const monthLabel = (t: number) =>
      new Date(t).toLocaleDateString("en-GB", {
        month: "short",
        ...(crossesYears ? { year: "2-digit" } : {}),
      });

    const collect = (
      seed: Date,
      advance: (d: Date, step: number) => void,
      step: number,
    ) => {
      const out: number[] = [];
      const cursor = new Date(seed);
      // Date arithmetic (not fixed ms) so DST shifts don't drift the ticks.
      while (cursor.getTime() <= dataMax && out.length < 200) {
        if (cursor.getTime() >= dataMin) out.push(cursor.getTime());
        advance(cursor, step);
      }
      return out;
    };

    if (tickSize === "5m") {
      const seed = new Date(dataMin);
      seed.setMinutes(0, 0, 0);
      if (seed.getTime() < dataMin) seed.setHours(seed.getHours() + 1);
      const hours = Math.max(1, (dataMax - seed.getTime()) / 3_600_000);
      const step = Math.max(1, Math.ceil(hours / (isMobile ? 6 : 24)));
      return {
        ticks: collect(seed, (d, s) => d.setHours(d.getHours() + s), step),
        format: hourLabel,
      };
    }

    if (tickSize === "1h" || (tickSize === "1d" && spanDays <= 45)) {
      const seed = new Date(dataMin);
      seed.setHours(0, 0, 0, 0);
      if (seed.getTime() < dataMin) seed.setDate(seed.getDate() + 1);
      const days = Math.max(1, (dataMax - seed.getTime()) / 86_400_000);
      const step = Math.max(1, Math.ceil(days / (isMobile ? 4 : 8)));
      return {
        ticks: collect(seed, (d, s) => d.setDate(d.getDate() + s), step),
        format: dayLabel,
      };
    }

    // Long daily spans: label month starts instead of arbitrary dates.
    const seed = new Date(
      new Date(dataMin).getFullYear(),
      new Date(dataMin).getMonth(),
      1,
    );
    if (seed.getTime() < dataMin) seed.setMonth(seed.getMonth() + 1);
    const months = Math.max(1, spanDays / 30.4);
    const step = Math.max(1, Math.ceil(months / (isMobile ? 4 : 9)));
    return {
      ticks: collect(seed, (d, s) => d.setMonth(d.getMonth() + s), step),
      format: monthLabel,
    };
  }, [history?.tickSize, chartData, window_, isMobile]);

  const rangeLabel = useMemo(
    () =>
      formatRangeLabel(window_, customRange ? null : period, new Date(clock)),
    [window_, customRange, period, clock],
  );

  // Paging back is pointless once the window predates the first sample.
  const canGoOlder = useMemo(() => {
    if (customRange || period === "ALL") return false;
    if (!history?.earliestData) return true;
    return window_.start.getTime() > new Date(history.earliestData).getTime();
  }, [history?.earliestData, customRange, period, window_]);

  const canGoNewer = !customRange && offset > 0 && period !== "ALL";

  const timestampHeader = `Timestamp (${localOffsetLabel()})`;

  const handleDownloadCsv = useCallback(() => {
    const header = [
      `timestamp_${localOffsetLabel()}`,
      "luxor_hashrate_hs",
      "braiins_hashrate_hs",
      "luxor_efficiency_pct",
      "luxor_uptime_pct",
    ];
    const lines = chartData.map((row) =>
      [
        formatTimestamp(row.t),
        row.luxor ?? "",
        row.braiins ?? "",
        row.efficiency != null ? row.efficiency.toFixed(2) : "",
        row.uptime != null ? row.uptime.toFixed(2) : "",
      ].join(","),
    );

    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hashrate-${poolMode}-${toDateInput(window_.start)}_to_${toDateInput(window_.end)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [chartData, poolMode, window_]);

  const toggleFullscreen = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      element.requestFullscreen?.().catch(() => {});
    }
  }, []);

  // Track fullscreen from the document, so Esc and the button stay in sync.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const hasData = chartData.length > 0;
  const chartHeight = isFullscreen ? Math.max(height, 560) : height;

  const notes = [
    showBraiins && braiinsSeries?.available ? braiinsSeries.note : null,
    // Worker-level Braiins data doesn't just lag behind — it never exists
    // (no historical worker endpoint at any granularity), so this replaces
    // the generic "no data" empty state with an explanation for that case.
    minerId && !hasData && history?.activePoolNames?.includes("Braiins")
      ? "Historical hashrate data isn't available for Braiins miners — Braiins has no worker-level history endpoint. Current status is still shown live elsewhere on this page."
      : null,
    // Luxor only publishes uptime once a UTC day has fully closed, so a
    // window that's entirely "today" (the live 1D view, or a custom range
    // starting today) has nothing to show yet. Availability, not visibility
    // — otherwise toggling Uptime off in the legend would wrongly claim the
    // period cannot show it. Not shown at all for a per-miner chart — Luxor
    // has no per-worker uptime concept, so it's never a "not yet".
    !minerId && showLuxor && luxorSeries?.available && !hasUptime
      ? "Uptime is not shown for this period — the pool only publishes it once a day has fully closed."
      : null,
    history?.downgradedFrom
      ? `Showing ${history.tickSize} resolution — the pool only serves ${history.downgradedFrom} data for recent dates.`
      : null,
    showLuxor && luxorSeries?.error ? `Luxor: ${luxorSeries.error}` : null,
    showBraiins && braiinsSeries?.error
      ? `Braiins: ${braiinsSeries.error}`
      : null,
  ].filter(Boolean) as string[];

  return (
    <Paper
      ref={containerRef}
      sx={{
        p: { xs: 1.5, sm: 2.5 },
        mb: { xs: 2, md: 4 },
        borderRadius: 2,
        backgroundColor: isDark ? theme.palette.grey[900] : "#ffffff",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
        overflow: "auto",
      }}
    >
      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.5,
          mb: 2,
        }}
      >
        <Typography
          variant="h6"
          sx={{ fontWeight: 600, fontSize: { xs: "1rem", sm: "1.15rem" } }}
        >
          {/* "A", "A & B", "A, B & C" — not "A & B & C". */}
          {(() => {
            const parts = [
              "Hashrate",
              hasEfficiency && "Shares Efficiency",
              hasUptime && "Uptime",
            ].filter(Boolean) as string[];
            return parts.length > 1
              ? `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`
              : parts[0];
          })()}
        </Typography>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          {/* Range navigation */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              borderRadius: 1.5,
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            <IconButton
              size="small"
              onClick={() => setOffset((o) => o + 1)}
              disabled={!canGoOlder}
              aria-label="Previous period"
            >
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <Typography
              variant="body2"
              sx={{
                px: 1,
                minWidth: { xs: 84, sm: 118 },
                textAlign: "center",
                whiteSpace: "nowrap",
              }}
            >
              {rangeLabel || "—"}
            </Typography>
            <IconButton
              size="small"
              onClick={() => setOffset((o) => Math.max(0, o - 1))}
              disabled={!canGoNewer}
              aria-label="Next period"
            >
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Period buttons */}
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {PERIODS.map((p) => (
              <Button
                key={p}
                size="small"
                onClick={() => selectPeriod(p)}
                variant={period === p ? "contained" : "outlined"}
                sx={{
                  minWidth: { xs: 34, sm: 44 },
                  px: { xs: 0.75, sm: 1.25 },
                  fontSize: { xs: "0.68rem", sm: "0.75rem" },
                }}
              >
                {p}
              </Button>
            ))}
          </Box>

          <MuiTooltip title="Custom date range">
            <IconButton
              size="small"
              onClick={() => {
                setShowRangePicker((open) => !open);
                if (!draftFrom) setDraftFrom(toDateInput(window_.start));
                if (!draftTo) setDraftTo(toDateInput(new Date()));
              }}
              color={customRange ? "primary" : "default"}
            >
              <DateRangeIcon fontSize="small" />
            </IconButton>
          </MuiTooltip>

          {/* Chart / table toggle */}
          <Box
            sx={{
              display: "flex",
              borderRadius: 1.5,
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            <MuiTooltip title="Chart view">
              <IconButton
                size="small"
                onClick={() => setView("chart")}
                color={view === "chart" ? "primary" : "default"}
              >
                <ShowChartIcon fontSize="small" />
              </IconButton>
            </MuiTooltip>
            <MuiTooltip title="Table view">
              <IconButton
                size="small"
                onClick={() => setView("table")}
                color={view === "table" ? "primary" : "default"}
              >
                <TableChartIcon fontSize="small" />
              </IconButton>
            </MuiTooltip>
          </Box>

          <MuiTooltip title="Download CSV">
            <span>
              <IconButton
                size="small"
                onClick={handleDownloadCsv}
                disabled={!hasData}
              >
                <DownloadIcon fontSize="small" />
              </IconButton>
            </span>
          </MuiTooltip>

          <MuiTooltip title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            <IconButton size="small" onClick={toggleFullscreen}>
              {isFullscreen ? (
                <FullscreenExitIcon fontSize="small" />
              ) : (
                <FullscreenIcon fontSize="small" />
              )}
            </IconButton>
          </MuiTooltip>
        </Box>
      </Box>

      {/* ── Custom range picker ───────────────────────────────────────── */}
      {showRangePicker && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            flexWrap: "wrap",
            mb: 2,
            p: 1.5,
            borderRadius: 1.5,
            backgroundColor: isDark
              ? "rgba(255,255,255,0.04)"
              : "rgba(0,0,0,0.03)",
          }}
        >
          <TextField
            label="From"
            type="date"
            size="small"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            inputProps={{ min: "2023-01-02", max: toDateInput(new Date()) }}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            inputProps={{ min: "2023-01-02", max: toDateInput(new Date()) }}
          />
          <Button
            size="small"
            variant="contained"
            onClick={applyCustomRange}
            disabled={!draftFrom || !draftTo || draftFrom > draftTo}
          >
            Apply
          </Button>
          {customRange && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<CloseIcon fontSize="small" />}
              onClick={clearCustomRange}
            >
              Clear
            </Button>
          )}
          <Typography variant="caption" color="text.secondary">
            Resolution is picked from the span: 5-minute within the last week,
            hourly within the last month, daily beyond.
          </Typography>
        </Box>
      )}

      {/* ── Body ──────────────────────────────────────────────────────── */}
      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || "Failed to load hashrate history"}
        </Alert>
      )}

      {isLoading && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: chartHeight,
          }}
        >
          <CircularProgress />
        </Box>
      )}

      {!isLoading && !isError && !hasData && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: chartHeight,
          }}
        >
          <Typography color="text.secondary">
            No hashrate data for this period.
          </Typography>
        </Box>
      )}

      {!isLoading && !isError && hasData && view === "chart" && (
        <Box
          sx={{
            width: "100%",
            opacity: isFetching ? 0.6 : 1,
            transition: "opacity 0.2s",
          }}
        >
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart
              data={chartData}
              margin={{
                top: 10,
                right: isMobile ? 4 : 12,
                left: isMobile ? 0 : 8,
                bottom: 0,
              }}
            >
              <defs>
                {/* Luxor's exact fill ramp: 0.15 → 0.01 opacity, vertical. */}
                <linearGradient
                  id="hashrateFillLuxor"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={LUXOR_COLOR}
                    stopOpacity={0.15}
                  />
                  <stop
                    offset="100%"
                    stopColor={LUXOR_COLOR}
                    stopOpacity={0.01}
                  />
                </linearGradient>
                <linearGradient
                  id="hashrateFillBraiins"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={BRAIINS_COLOR}
                    stopOpacity={0.15}
                  />
                  <stop
                    offset="100%"
                    stopColor={BRAIINS_COLOR}
                    stopOpacity={0.01}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="4 2"
                stroke={isDark ? GRID_DARK : GRID_LIGHT}
                vertical={false}
              />

              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                ticks={axis.ticks}
                tickFormatter={axis.format}
                tick={{
                  fontSize: isMobile ? 9 : 11,
                  fill: theme.palette.text.secondary,
                }}
                tickLine={false}
                minTickGap={isMobile ? 8 : 12}
              />

              <YAxis
                yAxisId="hashrate"
                tick={{
                  fontSize: isMobile ? 9 : 11,
                  fill: theme.palette.text.secondary,
                }}
                tickFormatter={(value: number) =>
                  (value / unit.divisor).toFixed(2)
                }
                width={isMobile ? 46 : 64}
                domain={["auto", "auto"]}
              />

              {hasPercentAxis && (
                <YAxis
                  yAxisId="efficiency"
                  orientation="right"
                  tick={{
                    fontSize: isMobile ? 9 : 11,
                    fill: theme.palette.text.secondary,
                  }}
                  tickFormatter={(value: number) => `${value}%`}
                  width={isMobile ? 38 : 50}
                  // Integer ticks only: fractional ticks round to the same
                  // label twice ("99" directly above "99").
                  allowDecimals={false}
                  domain={[
                    (dataMin: number) => Math.max(0, Math.floor(dataMin - 1)),
                    100,
                  ]}
                />
              )}

              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? theme.palette.grey[900] : "#fff",
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 8,
                  fontSize: "0.8rem",
                }}
                labelFormatter={(value) => formatTimestamp(Number(value))}
                formatter={(value, name) => {
                  const numeric = Number(value);
                  if (name === "Shares Efficiency" || name === "Uptime") {
                    return [`${numeric.toFixed(2)} %`, name];
                  }
                  // The series name already carries the unit for the legend;
                  // strip it here so the tooltip doesn't say it twice.
                  const label = String(name).replace(/\s*\(.*\)$/, "");
                  return [
                    `${(numeric / unit.divisor).toFixed(2)} ${unit.label}`,
                    label,
                  ];
                }}
              />

              {/* Legend is rendered below the chart as real toggle buttons —
                  see legendItems. Recharts' own legend had no room for a
                  readable "off" state. */}

              {hasLuxorHashrate && (
                <Area
                  yAxisId="hashrate"
                  type="monotone"
                  dataKey="luxor"
                  hide={isHidden("luxor")}
                  name={
                    isSingleAvailableSeries
                      ? `Hashrate (${unit.label})`
                      : `Luxor (${unit.label})`
                  }
                  stroke={LUXOR_COLOR}
                  strokeWidth={2}
                  fill="url(#hashrateFillLuxor)"
                  dot={sparseDot(luxorSeries!.points.length)}
                  connectNulls
                  activeDot={{ r: 4 }}
                />
              )}

              {hasBraiinsHashrate && (
                <Area
                  yAxisId="hashrate"
                  type="monotone"
                  dataKey="braiins"
                  hide={isHidden("braiins")}
                  name={
                    isSingleAvailableSeries
                      ? `Hashrate (${unit.label})`
                      : `Braiins (${unit.label})`
                  }
                  stroke={BRAIINS_COLOR}
                  strokeWidth={2}
                  fill="url(#hashrateFillBraiins)"
                  dot={sparseDot(braiinsSeries!.points.length)}
                  connectNulls
                  activeDot={{ r: 4 }}
                />
              )}

              {hasEfficiency && (
                <Line
                  yAxisId="efficiency"
                  type="monotone"
                  dataKey="efficiency"
                  hide={isHidden("efficiency")}
                  name="Shares Efficiency"
                  stroke={EFFICIENCY_COLOR}
                  strokeWidth={2}
                  strokeDasharray="4.5 4.5"
                  // Recharts' draw-in animation rewrites stroke-dasharray to
                  // animate the line, which collapsed the dashes to a solid
                  // stroke on some windows. Static rendering keeps the dash.
                  isAnimationActive={false}
                  dot={false}
                  connectNulls
                  activeDot={{ r: 4 }}
                />
              )}

              {hasUptime && (
                <Line
                  yAxisId="efficiency"
                  type="monotone"
                  dataKey="uptime"
                  hide={isHidden("uptime")}
                  name="Uptime"
                  stroke={UPTIME_COLOR}
                  strokeWidth={2}
                  // Solid, to stay distinguishable from the dashed efficiency
                  // line it shares the percentage axis with.
                  isAnimationActive={false}
                  // Uptime is one point per day, unlike the finer hashrate/
                  // efficiency series it shares the chart with — a dot on
                  // every point makes each day's value easy to pick out, and
                  // keeps a single-day window (e.g. a new week a few hours
                  // in) visible even with nothing to connect a line to yet.
                  dot={{ r: 3, fill: UPTIME_COLOR, strokeWidth: 0 }}
                  connectNulls
                  activeDot={{ r: 4 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Series toggles. Deliberately buttons rather than recharts' own
              legend: an "off" entry has to stay clearly readable, not fade
              out, so it still looks like something you can switch back on. */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: 1,
              mt: 1.5,
            }}
          >
            {legendItems.map((item) => {
              const off = isHidden(item.key);
              return (
                <ButtonBase
                  key={item.key}
                  onClick={() => toggleSeries(item.key)}
                  aria-pressed={!off}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    px: 1.25,
                    py: 0.5,
                    borderRadius: 999,
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    lineHeight: 1.6,
                    border: "1px solid",
                    borderColor: off ? "divider" : item.color,
                    backgroundColor: off
                      ? "transparent"
                      : alpha(item.color, isDark ? 0.22 : 0.1),
                    color: off ? "text.secondary" : "text.primary",
                    transition: "background-color .15s, border-color .15s",
                    "&:hover": {
                      backgroundColor: alpha(item.color, isDark ? 0.3 : 0.18),
                      borderColor: item.color,
                    },
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      width: 16,
                      borderTop: "3px",
                      borderTopStyle: item.dashed ? "dashed" : "solid",
                      borderTopColor: off
                        ? theme.palette.action.disabled
                        : item.color,
                    }}
                  />
                  {item.label}
                </ButtonBase>
              );
            })}
          </Box>
        </Box>
      )}

      {!isLoading && !isError && hasData && view === "table" && (
        <TableContainer sx={{ maxHeight: chartHeight }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>
                  {timestampHeader}
                </TableCell>
                {hasLuxorHashrate && (
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {isSingleAvailableSeries ? "Hashrate" : "Luxor"}
                  </TableCell>
                )}
                {hasBraiinsHashrate && (
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {isSingleAvailableSeries ? "Hashrate" : "Braiins"}
                  </TableCell>
                )}
                {hasEfficiency && (
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    Shares Efficiency
                  </TableCell>
                )}
                {hasUptime && (
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    Uptime
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {[...chartData].reverse().map((row) => (
                <TableRow key={row.t} hover>
                  <TableCell>{formatTimestamp(row.t)}</TableCell>
                  {hasLuxorHashrate && (
                    <TableCell align="right">
                      {row.luxor != null
                        ? `${(row.luxor / unit.divisor).toFixed(2)} ${unit.label}`
                        : "—"}
                    </TableCell>
                  )}
                  {hasBraiinsHashrate && (
                    <TableCell align="right">
                      {row.braiins != null
                        ? `${(row.braiins / unit.divisor).toFixed(2)} ${unit.label}`
                        : "—"}
                    </TableCell>
                  )}
                  {hasEfficiency && (
                    <TableCell align="right">
                      {row.efficiency != null
                        ? `${row.efficiency.toFixed(2)} %`
                        : "—"}
                    </TableCell>
                  )}
                  {hasUptime && (
                    <TableCell align="right">
                      {row.uptime != null ? `${row.uptime.toFixed(2)} %` : "—"}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {notes.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          {notes.map((note) => (
            <Typography
              key={note}
              variant="caption"
              color="text.secondary"
              sx={{ display: "block" }}
            >
              {note}
            </Typography>
          ))}
        </Box>
      )}
    </Paper>
  );
}
