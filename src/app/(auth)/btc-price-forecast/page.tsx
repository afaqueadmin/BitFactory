"use client";

/**
 * BTC Price Predictor page - BitFactory Daylight theme (v1.3)
 *
 * Extends the "Buy BTC vs Mine BTC" chart (Payback Analysis) into the future:
 * today's breakeven production cost doubles at every halving (2028, 2032,
 * 2036, 2040, 2044), and the average premium BTC has traded at over that cost
 * is applied to estimate the price at each halving. See
 * lib/helpers/btcPriceForecast.ts for the model and its assumptions.
 *
 * Kept deliberately simple: miner/firmware picker → three KPI cards (price,
 * cost, next-halving countdown) → chart → table → one-line disclaimer.
 *
 * Data: /api/payback-history (CLIENT profile, ALL range) - the same series
 * PaybackHistoryChart plots.
 */

import React, { useMemo, useState } from "react";
import { Alert, Box, Skeleton, Typography, useMediaQuery } from "@mui/material";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import CurrencyBitcoinIcon from "@mui/icons-material/CurrencyBitcoin";
import PrecisionManufacturingOutlinedIcon from "@mui/icons-material/PrecisionManufacturingOutlined";
import HourglassTopOutlinedIcon from "@mui/icons-material/HourglassTopOutlined";
import Segmented from "@/components/daylight/Segmented";
import { usePaybackHistory } from "@/hooks/usePaybackHistory";
import { MINER_LABELS, MinerModel } from "@/lib/helpers/paybackCalculations";
import {
  ForecastChartPoint,
  OsVariant,
  PREVIOUS_HALVING_DATE,
  historyDayMs,
  buildForecastBaseline,
  buildForecastChartSeries,
  buildHalvingForecast,
} from "@/lib/helpers/btcPriceForecast";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

// Past price and cost match PaybackHistoryChart 1:1 (the "Buy vs Mine"
// chart this one continues); the forecast is light green so it reads as a
// different, estimated series.
const COLOR_COST = "#1976D2";
const COLOR_PRICE = "#F59E0B";
const COLOR_FORECAST = "#4CC38A";

/** Candidate ticks for the log price axis. */
const LOG_TICKS = [
  10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000,
  5_000_000, 10_000_000, 25_000_000,
];

const MINER_OPTIONS = (["S21PRO", "S21XP"] as MinerModel[]).map((id) => ({
  id,
  label: MINER_LABELS[id],
}));
const OS_OPTIONS: { id: OsVariant; label: string }[] = [
  { id: "STOCK", label: "Stock OS" },
  { id: "CUSTOM", label: "Custom OS" },
];

const formatUsd = (value: number): string =>
  `$${Math.round(value).toLocaleString("en-US")}`;

const formatCompactUsd = (value: number): string =>
  `$${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 2 : 0,
  }).format(value)}`;

const formatMultiple = (value: number): string =>
  `${value.toFixed(value >= 10 ? 0 : 1)}×`;

const formatDay = (ms: number): string =>
  !Number.isFinite(ms)
    ? "—"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(ms);

const formatSignedPercent = (value: number): string => {
  const pct = Math.round(value * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
};

const formatHalvingMonth = (ms: number): string =>
  new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    ms,
  );

/** Recharts range-area accessor: the likely-range band (forecast only). */
const priceBand = (p: ForecastChartPoint) => p.band;

function Swatch({ color, band }: { color: string; band?: boolean }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: "inline-block",
        flexShrink: 0,
        width: band ? 14 : 9,
        height: 9,
        borderRadius: band ? "3px" : "50%",
        bgcolor: color,
        opacity: band ? 0.3 : 1,
      }}
    />
  );
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;

type KpiTone = "amber" | "sky" | "mint";

/**
 * Forecast KPI card. All three cards share one fixed structure - title/icon,
 * big value, a labelled bar, then two label/value rows pinned to the bottom -
 * so they line up row for row whatever their content. Same Daylight tones as
 * StatCard.
 */
function KpiCard({
  tone,
  icon,
  title,
  value,
  unit,
  bar,
  rows,
  isLoading,
}: {
  tone: KpiTone;
  icon: React.ReactNode;
  title: string;
  value: string;
  unit?: string;
  bar?: { label: string; fraction: number };
  rows: { label: string; value: React.ReactNode }[];
  isLoading: boolean;
}) {
  const { d, fonts } = useDaylight();
  const t = {
    amber: { bg: d.amber, border: d.borderAmber, accent: d.warning },
    sky: { bg: d.skySoft, border: d.borderSky, accent: d.action },
    mint: { bg: d.mint, border: d.borderMint, accent: d.success },
  }[tone];
  const fraction = Math.min(1, Math.max(0, bar?.fraction ?? 0));

  return (
    <Box
      role="article"
      aria-label={title}
      sx={{
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: RADIUS_CARD,
        boxShadow: d.shadow,
        p: { xs: "16px 15px", sm: "19px 20px" },
        fontFamily: fonts.body,
      }}
    >
      {/* Title + icon */}
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
            color: t.accent,
            "& svg": { fontSize: { xs: 13, sm: 16 } },
          }}
        >
          {icon}
        </Box>
      </Box>

      {isLoading ? (
        <>
          <Skeleton
            variant="rounded"
            sx={{ mt: "9px", mb: "5px", height: 36, width: "65%" }}
          />
          <Skeleton variant="rounded" sx={{ mt: "8px", height: 6 }} />
          <Skeleton variant="text" sx={{ mt: "14px", width: "90%" }} />
          <Skeleton variant="text" sx={{ width: "80%" }} />
        </>
      ) : (
        <>
          {/* Value */}
          <Typography
            component="p"
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 750,
              fontSize: { xs: 24, sm: 28 },
              lineHeight: 1.4,
              letterSpacing: { xs: "-.8px", sm: "-1px" },
              color: d.text,
              m: "9px 0 10px",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
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
                  ml: "6px",
                  color: d.cardMuted,
                }}
              >
                {unit}
              </Box>
            )}
          </Typography>

          {/* Labelled bar */}
          {bar && (
            <Box>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: d.cardMuted,
                  mb: "5px",
                }}
              >
                <span>{bar.label}</span>
                <Box
                  component="span"
                  sx={{
                    fontWeight: 700,
                    color: t.accent,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatPercent(fraction)}
                </Box>
              </Box>
              <Box
                role="progressbar"
                aria-label={bar.label}
                aria-valuenow={Math.round(fraction * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                sx={{
                  height: 6,
                  borderRadius: "999px",
                  bgcolor: d.surface,
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    width: `${fraction * 100}%`,
                    height: "100%",
                    borderRadius: "999px",
                    bgcolor: t.accent,
                  }}
                />
              </Box>
            </Box>
          )}

          {/* Detail rows, pinned to the bottom so all cards align */}
          <Box
            sx={{
              mt: "auto",
              pt: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            {rows.map((row) => (
              <Box
                key={row.label}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "10px",
                  pt: "6px",
                  borderTop: `1px dashed ${t.border}`,
                  fontSize: { xs: 11, sm: 12 },
                }}
              >
                <Box component="span" sx={{ color: d.cardMuted }}>
                  {row.label}
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontWeight: 650,
                    color: d.text,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {row.value}
                </Box>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

export default function BtcPriceForecastPage() {
  const { d, fonts } = useDaylight();
  const isMobile = useMediaQuery("(max-width:599.95px)");
  const [miner, setMiner] = useState<MinerModel>("S21PRO");
  const [os, setOs] = useState<OsVariant>("STOCK");

  const { historyData, isLoading, isError, error } = usePaybackHistory(
    "CLIENT",
    miner,
    "ALL",
  );

  const baseline = useMemo(
    () => buildForecastBaseline(historyData, os),
    [historyData, os],
  );
  // "Based on current trends": the average premium across all history.
  const premium = baseline
    ? (baseline.premiums.AVG_ALL ?? baseline.premiums.CURRENT)
    : null;
  const rows = useMemo(
    () =>
      baseline && premium !== null
        ? buildHalvingForecast(baseline, premium)
        : [],
    [baseline, premium],
  );
  const finalRow = rows[rows.length - 1];
  const nextRow = rows.find((r) => r.halvings === 1);
  // Fixed at mount; day-level precision doesn't need a ticking clock.
  const [now] = useState(() => Date.now());
  const daysLeft = nextRow
    ? Math.max(0, Math.ceil((nextRow.timestamp - now) / MS_PER_DAY))
    : 0;
  const epochStart = PREVIOUS_HALVING_DATE.getTime();
  const epochProgress = nextRow
    ? (now - epochStart) / (nextRow.timestamp - epochStart)
    : 0;
  const series = useMemo(
    () => buildForecastChartSeries(historyData, os, rows),
    [historyData, os, rows],
  );
  const pointByX = useMemo(
    () => new Map(series.points.map((p) => [p.x, p])),
    [series],
  );
  // X ticks: start of history, today, then each halving.
  const xTicks = useMemo(() => {
    const ticks: { x: number; label: string }[] = [];
    const first = series.points[0];
    if (first && first.row === null) {
      ticks.push({
        x: first.x,
        label: new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(first.timestamp),
      });
    }
    for (const r of rows) {
      ticks.push({
        x: series.xOf(r.timestamp),
        label: r.halvings === 0 ? "Today" : r.label,
      });
    }
    return ticks;
  }, [series, rows]);
  const tickLabelByX = useMemo(
    () => new Map(xTicks.map((t) => [t.x, t.label])),
    [xTicks],
  );
  // Log price axis: the past (~$40-90K) and the 2044 forecast (~$2.5M) both
  // need to be readable on one chart.
  const yTicks = useMemo(() => {
    const values = series.points.flatMap((p) =>
      [p.pastPrice, p.forecastPrice, p.cost, p.band?.[0], p.band?.[1]].filter(
        (v): v is number => typeof v === "number" && v > 0,
      ),
    );
    if (values.length === 0) return LOG_TICKS.slice(0, 3);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const lo = [...LOG_TICKS].reverse().find((t) => t <= min) ?? LOG_TICKS[0];
    const hi =
      LOG_TICKS.find((t) => t >= max) ?? LOG_TICKS[LOG_TICKS.length - 1];
    return LOG_TICKS.filter((t) => t >= lo && t <= hi);
  }, [series]);
  const ready = !!baseline && premium !== null && !!finalRow;
  const osLabel = os === "STOCK" ? "Stock OS" : "Custom OS";

  const cardSx = {
    p: { xs: "18px", sm: "20px 24px" },
    borderRadius: RADIUS_CARD,
    bgcolor: d.surface,
    border: `1px solid ${d.border}`,
    boxShadow: d.shadow,
    mb: { xs: "16px", md: "20px" },
  };
  const cardTitleSx = {
    fontFamily: fonts.heading,
    fontWeight: 750,
    fontSize: { xs: 16, sm: 18 },
    color: d.text,
  };
  const thSx = {
    textAlign: "right" as const,
    p: "11px 16px",
    fontSize: 11,
    fontWeight: 600,
    color: d.muted,
    bgcolor: d.tableHead,
    borderBottom: `1px solid ${d.border}`,
    whiteSpace: "nowrap" as const,
  };
  const tdSx = {
    textAlign: "right" as const,
    p: "12px 16px",
    fontSize: 13,
    borderBottom: `1px solid ${d.border}`,
    whiteSpace: "nowrap" as const,
    fontVariantNumeric: "tabular-nums",
  };

  return (
    <Box
      sx={{ maxWidth: 1600, mx: "auto", fontFamily: fonts.body, color: d.text }}
    >
      {/* Heading + miner/firmware picker */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", md: "flex-end" },
          gap: "14px",
          mb: { xs: "20px", md: "26px" },
        }}
      >
        <Box>
          <Typography
            component="h1"
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 750,
              fontSize: { xs: 27, md: 32 },
              lineHeight: 1.3,
              letterSpacing: "-.035em",
              color: d.text,
            }}
          >
            BTC Price Predictor
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: 12, md: 13 },
              lineHeight: { xs: 1.7, md: 1.5 },
              color: d.muted,
              mt: "7px",
            }}
          >
            The cost to mine bitcoin doubles every halving, and BTC trades at a
            premium over that cost.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <Segmented
            ariaLabel="Miner model"
            value={miner}
            onChange={setMiner}
            options={MINER_OPTIONS}
          />
          <Segmented
            ariaLabel="Miner firmware"
            value={os}
            onChange={setOs}
            options={OS_OPTIONS}
          />
        </Box>
      </Box>

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || "Failed to load production cost history."}
        </Alert>
      )}

      {!isLoading && !isError && !baseline && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No production cost history is available yet for this miner.
        </Alert>
      )}

      {/* KPI cards - skeletons while loading */}
      {!isError && (isLoading || ready) && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
            gap: { xs: "10px", sm: "14px" },
            mb: { xs: "16px", md: "20px" },
          }}
        >
          <KpiCard
            tone="amber"
            icon={<CurrencyBitcoinIcon />}
            title="BTC price today"
            isLoading={!ready}
            value={baseline ? formatUsd(baseline.btcPriceUsd) : ""}
            bar={
              baseline
                ? {
                    label: "Mining margin",
                    fraction:
                      1 - baseline.productionCost / baseline.btcPriceUsd,
                  }
                : undefined
            }
            rows={[
              {
                label: "Premium over cost",
                value: baseline
                  ? formatMultiple(baseline.premiums.CURRENT ?? 1)
                  : "—",
              },
              {
                label: "Price as of",
                value: baseline ? formatDay(historyDayMs(baseline.date)) : "—",
              },
            ]}
          />
          <KpiCard
            tone="sky"
            icon={<PrecisionManufacturingOutlinedIcon />}
            title="Cost to mine 1 BTC today"
            isLoading={!ready}
            value={baseline ? formatUsd(baseline.productionCost) : ""}
            bar={
              baseline
                ? {
                    label: "Share of BTC price",
                    fraction: baseline.productionCost / baseline.btcPriceUsd,
                  }
                : undefined
            }
            rows={[
              { label: "Miner", value: `${MINER_LABELS[miner]} · ${osLabel}` },
              {
                label: `After ${nextRow?.label ?? "next"} halving`,
                value: nextRow ? formatUsd(nextRow.productionCost) : "—",
              },
            ]}
          />
          <KpiCard
            tone="mint"
            icon={<HourglassTopOutlinedIcon />}
            title="Next halving"
            isLoading={!ready}
            value={daysLeft.toLocaleString("en-US")}
            unit="days to go"
            bar={{ label: "Cycle progress", fraction: epochProgress }}
            rows={[
              {
                label: "Expected",
                value: nextRow ? `~${formatDay(nextRow.timestamp)}` : "—",
              },
              {
                label: "Block reward",
                value: nextRow
                  ? `${nextRow.blockReward * 2} → ${nextRow.blockReward} BTC`
                  : "—",
              },
            ]}
          />
        </Box>
      )}

      {isLoading && (
        <Skeleton
          variant="rounded"
          sx={{ height: 420, borderRadius: RADIUS_CARD, mb: "20px" }}
        />
      )}

      {ready && baseline && premium !== null && finalRow && (
        <>
          {/* Chart */}
          <Box sx={cardSx}>
            <Typography sx={cardTitleSx}>
              Past price, cost to mine and predicted price
            </Typography>
            <Typography sx={{ fontSize: 12, color: d.muted, mt: "3px" }}>
              Left: daily history from the Buy vs Mine chart. Right: forecast at
              each halving — predicted price = cost to mine ×{" "}
              {formatMultiple(premium)}, the average premium BTC has traded at.
            </Typography>
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px 16px",
                mt: "12px",
                mb: "8px",
                fontSize: 12,
              }}
            >
              {[
                { color: COLOR_PRICE, label: "Past BTC price" },
                { color: COLOR_COST, label: "Cost to mine" },
                { color: COLOR_FORECAST, label: "Predicted price" },
                { color: COLOR_FORECAST, band: true, label: "Likely range" },
              ].map((item) => (
                <Box
                  key={item.label}
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                  }}
                >
                  <Swatch color={item.color} band={item.band} />
                  {item.label}
                </Box>
              ))}
            </Box>

            <Box sx={{ width: "100%", height: isMobile ? 300 : 400 }}>
              <ResponsiveContainer>
                <ComposedChart
                  data={series.points}
                  margin={{
                    top: 24,
                    right: isMobile ? 8 : 24,
                    bottom: 0,
                    left: 0,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="forecastBand"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={COLOR_FORECAST}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="100%"
                        stopColor={COLOR_FORECAST}
                        stopOpacity={0.08}
                      />
                    </linearGradient>
                  </defs>
                  {/* Past region, shaded and labelled so the two time
                      scales aren't mistaken for one. */}
                  <ReferenceArea
                    x1={0}
                    x2={series.todayX}
                    fill={d.canvas}
                    fillOpacity={0.9}
                    label={{
                      value: "Past · daily",
                      position: "insideTopLeft",
                      fill: d.muted,
                      fontSize: 11,
                    }}
                  />
                  <ReferenceArea
                    x1={series.todayX}
                    x2={1}
                    fill="transparent"
                    label={{
                      value: "Forecast · by halving",
                      position: "insideTopRight",
                      fill: d.muted,
                      fontSize: 11,
                    }}
                  />
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={d.border}
                  />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={[0, 1]}
                    ticks={xTicks.map((t) => t.x)}
                    tickFormatter={(x: number) => tickLabelByX.get(x) ?? ""}
                    tick={{ fontSize: 11, fill: d.muted }}
                    tickLine={false}
                    stroke={d.border}
                    padding={{ left: 8, right: 16 }}
                  />
                  <YAxis
                    scale="log"
                    domain={[yTicks[0], yTicks[yTicks.length - 1]]}
                    ticks={yTicks}
                    allowDataOverflow
                    tickFormatter={formatCompactUsd}
                    tick={{ fontSize: 11, fill: d.muted }}
                    tickLine={false}
                    axisLine={false}
                    width={isMobile ? 52 : 64}
                  />
                  <Tooltip
                    cursor={{ stroke: d.inputBorder, strokeDasharray: "3 3" }}
                    content={({ active, label }) => {
                      const point = pointByX.get(Number(label));
                      if (!active || !point) return null;
                      const row = point.row;
                      const isFuture = !!row && row.halvings > 0;
                      const price = point.forecastPrice ?? point.pastPrice ?? 0;
                      return (
                        <Box
                          sx={{
                            bgcolor: d.surface,
                            border: `1px solid ${d.border}`,
                            borderRadius: "10px",
                            boxShadow: "0 8px 24px rgba(0,0,0,.12)",
                            p: "10px 12px",
                            minWidth: 200,
                            fontFamily: fonts.body,
                            fontSize: 12,
                            color: d.text,
                          }}
                        >
                          <Typography
                            sx={{
                              fontFamily: fonts.heading,
                              fontWeight: 750,
                              fontSize: 13,
                              mb: "6px",
                            }}
                          >
                            {!row
                              ? formatDay(point.timestamp)
                              : row.halvings === 0
                                ? `Today · ${formatDay(row.timestamp)}`
                                : `${row.label} halving`}
                          </Typography>
                          {[
                            {
                              color: isFuture ? COLOR_FORECAST : COLOR_PRICE,
                              label: isFuture ? "Predicted" : "BTC price",
                              value: formatUsd(price),
                              band: false,
                            },
                            // Only predictions carry a range.
                            ...(isFuture && row
                              ? [
                                  {
                                    color: COLOR_FORECAST,
                                    label: "Likely range",
                                    value: `${formatUsd(row.priceLow)} – ${formatUsd(row.priceHigh)}`,
                                    band: true,
                                  },
                                ]
                              : []),
                            {
                              color: COLOR_COST,
                              label: "Cost to mine",
                              value: formatUsd(point.cost),
                              band: false,
                            },
                          ].map((item) => (
                            <Box
                              key={item.label}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: "7px",
                                py: "2px",
                              }}
                            >
                              <Swatch color={item.color} band={item.band} />
                              <Box component="span" sx={{ color: d.muted }}>
                                {item.label}
                              </Box>
                              <Box
                                component="span"
                                sx={{
                                  ml: "auto",
                                  pl: "12px",
                                  fontWeight: item.band ? 500 : 700,
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {item.value}
                              </Box>
                            </Box>
                          ))}
                          {/* Buy vs mine gap - same figure as the table's
                              Premium column. */}
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              mt: "6px",
                              pt: "6px",
                              borderTop: `1px solid ${d.border}`,
                            }}
                          >
                            <Box component="span" sx={{ color: d.muted }}>
                              Premium (buy vs mine)
                            </Box>
                            <Box
                              component="span"
                              sx={{
                                ml: "auto",
                                pl: "12px",
                                fontWeight: 700,
                                fontVariantNumeric: "tabular-nums",
                                color:
                                  price >= point.cost ? d.success : d.danger,
                              }}
                            >
                              {formatSignedPercent(price / point.cost - 1)}
                            </Box>
                          </Box>
                        </Box>
                      );
                    }}
                  />
                  <ReferenceLine
                    x={series.todayX}
                    stroke={d.inputBorder}
                    strokeWidth={1.5}
                  />
                  <Area
                    type="linear"
                    dataKey={priceBand}
                    name="Likely range"
                    stroke="none"
                    fill="url(#forecastBand)"
                    isAnimationActive={false}
                    activeDot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="pastPrice"
                    name="Past BTC price"
                    stroke={COLOR_PRICE}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: COLOR_PRICE }}
                    isAnimationActive={false}
                  />
                  {/* Daily breakeven in the past; flat between halvings and
                      doubling at each one in the forecast. */}
                  <Line
                    type="stepAfter"
                    dataKey="cost"
                    name="Cost to mine"
                    stroke={COLOR_COST}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: COLOR_COST }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="forecastPrice"
                    name="Predicted price"
                    stroke={COLOR_FORECAST}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: d.surface, strokeWidth: 2.5 }}
                    activeDot={{ r: 6, fill: COLOR_FORECAST }}
                    isAnimationActive={false}
                  >
                    {!isMobile && (
                      <LabelList
                        dataKey="forecastLabel"
                        position="top"
                        offset={10}
                        formatter={(v) =>
                          v == null ? "" : formatCompactUsd(Number(v))
                        }
                        style={{ fontSize: 11, fontWeight: 600, fill: d.text }}
                      />
                    )}
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
            <Typography
              sx={{
                fontSize: 11,
                color: d.muted,
                mt: "6px",
                textAlign: "right",
              }}
            >
              Price axis is logarithmic — each step up is a multiple, so the
              past and the forecast fit on one chart.
            </Typography>
          </Box>

          {/* Table */}
          <Box sx={{ ...cardSx, p: 0, overflow: "hidden" }}>
            <Box sx={{ overflowX: "auto" }}>
              <Box
                component="table"
                sx={{ width: "100%", borderCollapse: "collapse" }}
              >
                <thead>
                  <tr>
                    <Box component="th" sx={{ ...thSx, textAlign: "left" }}>
                      Halving
                    </Box>
                    <Box component="th" sx={thSx}>
                      Block reward
                    </Box>
                    <Box component="th" sx={thSx}>
                      Cost to mine
                    </Box>
                    <Box component="th" sx={thSx}>
                      Predicted price
                    </Box>
                    <Box
                      component="th"
                      sx={thSx}
                      title="How much more buying 1 BTC costs than mining it: (price − cost to mine) ÷ cost to mine"
                    >
                      Premium
                    </Box>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isToday = row.halvings === 0;
                    return (
                      <Box
                        component="tr"
                        key={row.label}
                        sx={{
                          bgcolor: isToday ? d.tableHead : "transparent",
                          "&:last-of-type td": { borderBottom: 0 },
                        }}
                      >
                        <Box
                          component="td"
                          sx={{ ...tdSx, textAlign: "left", fontWeight: 600 }}
                        >
                          {isToday ? (
                            "Today"
                          ) : (
                            <>
                              {row.label}
                              {/* Estimated month; every projected halving
                                  lands in April. */}
                              <Box
                                component="span"
                                sx={{
                                  color: d.muted,
                                  fontWeight: 500,
                                  ml: "5px",
                                }}
                              >
                                (~{formatHalvingMonth(row.timestamp)})
                              </Box>
                            </>
                          )}
                        </Box>
                        <Box component="td" sx={{ ...tdSx, color: d.muted }}>
                          {row.blockReward} BTC
                        </Box>
                        <Box component="td" sx={{ ...tdSx, color: COLOR_COST }}>
                          {formatUsd(row.productionCost)}
                        </Box>
                        <Box component="td" sx={{ ...tdSx, fontWeight: 700 }}>
                          {formatUsd(row.predictedPrice)}
                        </Box>
                        {/* Buy vs mine gap: how much more buying costs. */}
                        <Box
                          component="td"
                          sx={{
                            ...tdSx,
                            color:
                              row.predictedPrice >= row.productionCost
                                ? d.success
                                : d.danger,
                            fontWeight: 600,
                          }}
                        >
                          {formatSignedPercent(
                            row.predictedPrice / row.productionCost - 1,
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </tbody>
              </Box>
            </Box>
          </Box>
        </>
      )}

      <Typography
        sx={{
          mt: "4px",
          fontSize: 11,
          lineHeight: 1.6,
          color: d.muted,
          textAlign: "center",
        }}
      >
        Estimate only, not financial advice. Assumes today&apos;s difficulty,
        power cost and miner efficiency stay the same.
      </Typography>
    </Box>
  );
}
