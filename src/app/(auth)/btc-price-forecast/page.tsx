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
 * Kept deliberately simple: miner/firmware picker → three KPI cards → chart →
 * table → one-line disclaimer.
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import CurrencyBitcoinIcon from "@mui/icons-material/CurrencyBitcoin";
import PrecisionManufacturingOutlinedIcon from "@mui/icons-material/PrecisionManufacturingOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import StatCard from "@/components/daylight/StatCard";
import Segmented from "@/components/daylight/Segmented";
import { usePaybackHistory } from "@/hooks/usePaybackHistory";
import { MINER_LABELS, MinerModel } from "@/lib/helpers/paybackCalculations";
import {
  ForecastRow,
  OsVariant,
  buildForecastBaseline,
  buildHalvingForecast,
} from "@/lib/helpers/btcPriceForecast";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

// Matched 1:1 to PaybackHistoryChart so the two charts read as one story.
const COLOR_COST = "#1976D2";
const COLOR_PRICE = "#F59E0B";

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

/** Recharts range-area accessor: the low/high premium band. */
const priceBand = (row: ForecastRow): [number, number] => [
  row.priceLow,
  row.priceHigh,
];

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
  const rowByTimestamp = useMemo(
    () => new Map(rows.map((r) => [r.timestamp, r])),
    [rows],
  );
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
          <StatCard
            tone="amber"
            icon={<CurrencyBitcoinIcon />}
            title="BTC price today"
            isLoading={!ready}
            value={baseline ? formatUsd(baseline.btcPriceUsd) : ""}
            caption={
              baseline
                ? `${formatMultiple(baseline.premiums.CURRENT ?? 1)} the cost to mine`
                : undefined
            }
          />
          <StatCard
            tone="sky"
            icon={<PrecisionManufacturingOutlinedIcon />}
            title="Cost to mine 1 BTC today"
            isLoading={!ready}
            value={baseline ? formatUsd(baseline.productionCost) : ""}
            caption={`${MINER_LABELS[miner]} · ${osLabel}`}
          />
          <StatCard
            tone="mint"
            icon={<TrendingUpOutlinedIcon />}
            title={`Predicted price in ${finalRow?.label ?? "2044"}`}
            isLoading={!ready}
            value={finalRow ? formatCompactUsd(finalRow.predictedPrice) : ""}
            caption={
              finalRow
                ? `${formatMultiple(finalRow.multipleOfToday)} today's price`
                : undefined
            }
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
              Cost to mine vs predicted price
            </Typography>
            <Typography sx={{ fontSize: 12, color: d.muted, mt: "3px" }}>
              Predicted price = cost to mine × {formatMultiple(premium)}, the
              average premium BTC has traded at over its cost.
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
                { color: COLOR_PRICE, label: "Predicted price" },
                { color: COLOR_PRICE, band: true, label: "Likely range" },
                { color: COLOR_COST, label: "Cost to mine" },
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

            <Box sx={{ width: "100%", height: isMobile ? 280 : 380 }}>
              <ResponsiveContainer>
                <ComposedChart
                  data={rows}
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
                        stopColor={COLOR_PRICE}
                        stopOpacity={0.25}
                      />
                      <stop
                        offset="100%"
                        stopColor={COLOR_PRICE}
                        stopOpacity={0.06}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={d.border}
                  />
                  {/* Real time axis: today -> 2028 is ~1.5 years, the rest 4. */}
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    ticks={rows.map((r) => r.timestamp)}
                    tickFormatter={(ms: number) =>
                      rowByTimestamp.get(ms)?.label ?? ""
                    }
                    tick={{ fontSize: 11, fill: d.muted }}
                    tickLine={false}
                    stroke={d.border}
                    padding={{ left: 16, right: 16 }}
                  />
                  <YAxis
                    domain={[0, "auto"]}
                    tickFormatter={formatCompactUsd}
                    tick={{ fontSize: 11, fill: d.muted }}
                    tickLine={false}
                    axisLine={false}
                    width={isMobile ? 52 : 64}
                  />
                  <Tooltip
                    cursor={{ stroke: d.inputBorder, strokeDasharray: "3 3" }}
                    content={({ active, label }) => {
                      const row = rowByTimestamp.get(Number(label));
                      if (!active || !row) return null;
                      return (
                        <Box
                          sx={{
                            bgcolor: d.surface,
                            border: `1px solid ${d.border}`,
                            borderRadius: "10px",
                            boxShadow: "0 8px 24px rgba(0,0,0,.12)",
                            p: "10px 12px",
                            minWidth: 190,
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
                            {row.halvings === 0
                              ? `Today · ${formatDay(row.timestamp)}`
                              : `${row.label} halving`}
                          </Typography>
                          {[
                            {
                              color: COLOR_PRICE,
                              label: row.halvings === 0 ? "Price" : "Predicted",
                              value: formatUsd(row.predictedPrice),
                            },
                            {
                              color: COLOR_COST,
                              label: "Cost to mine",
                              value: formatUsd(row.productionCost),
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
                              <Swatch color={item.color} />
                              <Box component="span" sx={{ color: d.muted }}>
                                {item.label}
                              </Box>
                              <Box
                                component="span"
                                sx={{
                                  ml: "auto",
                                  pl: "12px",
                                  fontWeight: 700,
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {item.value}
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      );
                    }}
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
                    type="linear"
                    dataKey="predictedPrice"
                    name="Predicted price"
                    stroke={COLOR_PRICE}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: d.surface, strokeWidth: 2.5 }}
                    activeDot={{ r: 6, fill: COLOR_PRICE }}
                  >
                    {!isMobile && (
                      <LabelList
                        dataKey="predictedPrice"
                        position="top"
                        offset={10}
                        formatter={(v) => formatCompactUsd(Number(v))}
                        style={{ fontSize: 11, fontWeight: 600, fill: d.text }}
                      />
                    )}
                  </Line>
                  {/* Cost is flat between halvings and jumps at each one. */}
                  <Line
                    type="stepAfter"
                    dataKey="productionCost"
                    name="Cost to mine"
                    stroke={COLOR_COST}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: d.surface, strokeWidth: 2.5 }}
                    activeDot={{ r: 6, fill: COLOR_COST }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
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
                    <Box component="th" sx={thSx}>
                      vs today
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
                          {isToday ? "Today" : row.label}
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
                        <Box
                          component="td"
                          sx={{
                            ...tdSx,
                            fontWeight: 600,
                            color: isToday ? d.muted : d.success,
                          }}
                        >
                          {isToday ? "—" : formatMultiple(row.multipleOfToday)}
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
