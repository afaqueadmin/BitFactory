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
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Box,
  Paper,
  Typography,
  Button,
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
  height?: number;
}

interface ChartRow {
  t: number;
  luxor: number | null;
  braiins: number | null;
  efficiency: number | null;
}

/** yyyy-MM-dd in local time, for <input type="date">. */
const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function HashrateHistoryChart({
  poolMode = "total",
  userId,
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
        row = { t, luxor: null, braiins: null, efficiency: null };
        rows.set(t, row);
      }
      return row;
    };

    if (showLuxor && luxorSeries?.available) {
      for (const point of luxorSeries.points) {
        const row = touch(point.t);
        row.luxor = point.hashrate;
        row.efficiency = point.efficiency;
      }
    }

    if (showBraiins && braiinsSeries?.available) {
      for (const point of braiinsSeries.points) {
        touch(point.t).braiins = point.hashrate;
      }
    }

    return Array.from(rows.values()).sort((a, b) => a.t - b.t);
  }, [showLuxor, showBraiins, luxorSeries, braiinsSeries]);

  const unit = useMemo(() => {
    const values = chartData.flatMap((row) =>
      [row.luxor, row.braiins].filter((v): v is number => v != null && v > 0),
    );
    return resolveHashrateUnit(values.length ? Math.max(...values) : 0);
  }, [chartData]);

  // Efficiency only ever comes from Luxor, and only when Luxor is on screen.
  const showEfficiency =
    showLuxor &&
    !!luxorSeries?.available &&
    chartData.some((row) => row.efficiency != null);

  /**
   * How many hashrate series are actually drawn. A client on a single pool
   * sits in "total" mode with the page's pool toggle hidden, so styling keys
   * off this rather than poolMode.
   */
  const seriesCount =
    (showLuxor && luxorSeries?.available ? 1 : 0) +
    (showBraiins && braiinsSeries?.available ? 1 : 0);
  const isSingleSeries = seriesCount <= 1;

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
    ];
    const lines = chartData.map((row) =>
      [
        formatTimestamp(row.t),
        row.luxor ?? "",
        row.braiins ?? "",
        row.efficiency != null ? row.efficiency.toFixed(2) : "",
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
          Hashrate {showEfficiency ? "& Shares Efficiency" : ""}
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

              {showEfficiency && (
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
                  if (name === "Shares Efficiency") {
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

              <Legend wrapperStyle={{ fontSize: "0.8rem" }} iconType="line" />

              {showLuxor && luxorSeries?.available && (
                <Area
                  yAxisId="hashrate"
                  type="monotone"
                  dataKey="luxor"
                  name={
                    isSingleSeries
                      ? `Hashrate (${unit.label})`
                      : `Luxor (${unit.label})`
                  }
                  stroke={LUXOR_COLOR}
                  strokeWidth={2}
                  fill="url(#hashrateFillLuxor)"
                  dot={sparseDot(luxorSeries.points.length)}
                  connectNulls
                  activeDot={{ r: 4 }}
                />
              )}

              {showBraiins && braiinsSeries?.available && (
                <Area
                  yAxisId="hashrate"
                  type="monotone"
                  dataKey="braiins"
                  name={
                    isSingleSeries
                      ? `Hashrate (${unit.label})`
                      : `Braiins (${unit.label})`
                  }
                  stroke={BRAIINS_COLOR}
                  strokeWidth={2}
                  fill="url(#hashrateFillBraiins)"
                  dot={sparseDot(braiinsSeries.points.length)}
                  connectNulls
                  activeDot={{ r: 4 }}
                />
              )}

              {showEfficiency && (
                <Line
                  yAxisId="efficiency"
                  type="monotone"
                  dataKey="efficiency"
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
            </ComposedChart>
          </ResponsiveContainer>
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
                {showLuxor && luxorSeries?.available && (
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {isSingleSeries ? "Hashrate" : "Luxor"}
                  </TableCell>
                )}
                {showBraiins && braiinsSeries?.available && (
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {isSingleSeries ? "Hashrate" : "Braiins"}
                  </TableCell>
                )}
                {showEfficiency && (
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    Shares Efficiency
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {[...chartData].reverse().map((row) => (
                <TableRow key={row.t} hover>
                  <TableCell>{formatTimestamp(row.t)}</TableCell>
                  {showLuxor && luxorSeries?.available && (
                    <TableCell align="right">
                      {row.luxor != null
                        ? `${(row.luxor / unit.divisor).toFixed(2)} ${unit.label}`
                        : "—"}
                    </TableCell>
                  )}
                  {showBraiins && braiinsSeries?.available && (
                    <TableCell align="right">
                      {row.braiins != null
                        ? `${(row.braiins / unit.divisor).toFixed(2)} ${unit.label}`
                        : "—"}
                    </TableCell>
                  )}
                  {showEfficiency && (
                    <TableCell align="right">
                      {row.efficiency != null
                        ? `${row.efficiency.toFixed(2)} %`
                        : "—"}
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
