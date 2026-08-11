"use client";

/**
 * SVG charts for the payback analysis pages.
 *
 * Every value plotted here comes from `@/lib/helpers/paybackCalculations`.
 * These components only map already-computed numbers onto an axis — they
 * never re-derive revenue, payback or ROI.
 */

import { Box, Typography, useTheme } from "@mui/material";
import { useSeriesColors } from "./PaybackChartPrimitives";

const money = (v: number) => {
  const abs = Math.abs(v);
  const s =
    abs >= 1000
      ? "$" + (abs / 1000).toFixed(abs >= 10000 ? 0 : 1) + "k"
      : "$" + abs.toFixed(0);
  return (v < 0 ? "−" : "") + s;
};

const moneyFull = (v: number) =>
  (v < 0 ? "−$" : "$") +
  Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

/* ------------------------------------------------------------------ */
/* Cumulative cash flow — the payback curve                            */
/* ------------------------------------------------------------------ */

export function CashFlowChart({
  monthlyNetRevenue,
  machineCost,
  months = 60,
  paybackMonths,
}: {
  monthlyNetRevenue: number;
  machineCost: number;
  months?: number;
  paybackMonths: number;
}) {
  const c = useSeriesColors();
  const theme = useTheme();

  const W = 860;
  const H = 330;
  const L = 66;
  const R = 26;
  const T = 20;
  const B = 42;
  const pw = W - L - R;
  const ph = H - T - B;

  // Cumulative net cash after m months, starting from the capital outlay.
  const at = (m: number) => monthlyNetRevenue * m - machineCost;

  const values = Array.from({ length: months + 1 }, (_, m) => at(m));
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 0);
  const pad = (rawMax - rawMin) * 0.12 || 1;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;

  const x = (m: number) => L + (m / months) * pw;
  const y = (v: number) => T + ((yMax - v) / (yMax - yMin)) * ph;

  const ticks = 5;
  const gridVals = Array.from(
    { length: ticks + 1 },
    (_, i) => yMin + ((yMax - yMin) * i) / ticks,
  );

  const linePts = values.map((v, m) => `${x(m)},${y(v)}`).join(" ");

  // Shade the stretch where the client is still out of pocket.
  // Test the raw figure, not a clamped one — clamping to the chart width would
  // make every finite payback look like it lands inside the machine's life.
  const paybackReached =
    Number.isFinite(paybackMonths) &&
    paybackMonths > 0 &&
    paybackMonths <= months;

  // Underwater runs to break-even, or across the whole term if it never comes.
  const breakEven = paybackReached ? paybackMonths : months;
  const underwater = `${x(0)},${y(0)} ${values
    .slice(0, Math.ceil(breakEven) + 1)
    .map((v, m) => `${x(m)},${y(v)}`)
    .join(" ")} ${x(breakEven)},${y(0)}`;

  // Keep the break-even callout inside the plot when it lands near the edge.
  const labelFlips = x(breakEven) > L + pw * 0.72;

  return (
    <Box sx={{ minWidth: 620 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", width: "100%", height: "auto" }}
        role="img"
        aria-label={`Cumulative cash flow. Starts at negative ${moneyFull(machineCost)} and reaches break-even in month ${Math.round(paybackMonths)}.`}
      >
        {gridVals.map((v, i) => (
          <g key={i}>
            <line
              x1={L}
              x2={L + pw}
              y1={y(v)}
              y2={y(v)}
              stroke={c.grid}
              strokeWidth={1}
            />
            <text
              x={L - 9}
              y={y(v) + 3.5}
              textAnchor="end"
              fill={c.axis}
              fontSize={10.5}
              fontFamily="ui-monospace, monospace"
            >
              {money(v)}
            </text>
          </g>
        ))}

        {/* Zero line — the moment the client is square */}
        <line
          x1={L}
          x2={L + pw}
          y1={y(0)}
          y2={y(0)}
          stroke={c.axis}
          strokeWidth={1.4}
        />

        {Array.from({ length: months / 12 + 1 }, (_, i) => i * 12).map((m) => (
          <g key={m}>
            {m > 0 && (
              <line
                x1={x(m)}
                x2={x(m)}
                y1={T}
                y2={T + ph}
                stroke={c.grid}
                strokeWidth={1}
                strokeDasharray="2 4"
              />
            )}
            <text
              x={x(m)}
              y={H - B + 18}
              textAnchor="middle"
              fill={c.axis}
              fontSize={10.5}
              fontFamily="ui-monospace, monospace"
            >
              {m === 0 ? "start" : `yr ${m / 12}`}
            </text>
          </g>
        ))}

        {/* Out-of-pocket region */}
        <polygon points={underwater} fill={c.bad} opacity={0.13} />

        <polyline
          points={linePts}
          fill="none"
          stroke={c.primary}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {paybackReached && (
          <g>
            <line
              x1={x(breakEven)}
              x2={x(breakEven)}
              y1={y(0)}
              y2={T + ph}
              stroke={c.good}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <circle
              cx={x(breakEven)}
              cy={y(0)}
              r={5.5}
              fill={c.good}
              stroke={c.surface}
              strokeWidth={2}
            />
            <text
              x={x(breakEven) + (labelFlips ? -9 : 9)}
              y={y(0) - 10}
              textAnchor={labelFlips ? "end" : "start"}
              fill={c.good}
              fontSize={11.5}
              fontWeight={700}
              fontFamily="ui-monospace, monospace"
            >
              Paid back · month {Math.round(breakEven)}
            </text>
          </g>
        )}

        {/* Starting position and final position */}
        <circle
          cx={x(0)}
          cy={y(at(0))}
          r={4}
          fill={c.bad}
          stroke={c.surface}
          strokeWidth={2}
        />
        <text
          x={x(0) + 8}
          y={y(at(0)) + 15}
          fill={c.bad}
          fontSize={11}
          fontWeight={650}
          fontFamily="ui-monospace, monospace"
        >
          {moneyFull(at(0))}
        </text>
        <circle
          cx={x(months)}
          cy={y(at(months))}
          r={4}
          fill={c.primary}
          stroke={c.surface}
          strokeWidth={2}
        />
        <text
          x={x(months) - 6}
          y={y(at(months)) - 11}
          textAnchor="end"
          fill={c.primary}
          fontSize={12}
          fontWeight={700}
          fontFamily="ui-monospace, monospace"
        >
          {moneyFull(at(months))}
        </text>
      </svg>
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          fontSize: "0.78rem",
          px: 1,
          pt: 0.5,
          borderTop: 1,
          borderColor: theme.palette.divider,
          mt: 1,
        }}
      >
        Shaded area is the period the machine has not yet returned its purchase
        price.
      </Typography>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Where the money goes — waterfall                                    */
/* ------------------------------------------------------------------ */

export function WaterfallChart({
  grossRevenue,
  hostingCost,
  machineCost,
  loanInterest = 0,
}: {
  grossRevenue: number;
  hostingCost: number;
  machineCost: number;
  loanInterest?: number;
}) {
  const c = useSeriesColors();

  const steps: Array<{ label: string; delta: number; kind: string }> = [
    { label: "Mining revenue", delta: grossRevenue, kind: "in" },
    { label: "Hosting & power", delta: -hostingCost, kind: "out" },
    { label: "Machine", delta: -machineCost, kind: "out" },
  ];
  if (loanInterest > 0) {
    steps.push({ label: "Loan interest", delta: -loanInterest, kind: "out" });
  }
  const net = steps.reduce((a, s) => a + s.delta, 0);

  const W = 860;
  const H = 300;
  const L = 66;
  const R = 20;
  const T = 26;
  const B = 56;
  const pw = W - L - R;
  const ph = H - T - B;

  // Running totals so each bar starts where the previous one ended.
  let running = 0;
  const bars = steps.map((s) => {
    const from = running;
    running += s.delta;
    return { ...s, from, to: running };
  });

  const allVals = [
    0,
    ...bars.map((b) => b.to),
    ...bars.map((b) => b.from),
    net,
  ];
  const yMax = Math.max(...allVals) * 1.08;
  const yMin = Math.min(...allVals, 0) * 1.08;
  const y = (v: number) => T + ((yMax - v) / (yMax - yMin)) * ph;

  const slotCount = bars.length + 1;
  const slotW = pw / slotCount;
  const barW = Math.min(96, slotW * 0.56);
  const cx = (i: number) => L + slotW * i + slotW / 2;

  return (
    <Box sx={{ minWidth: 620 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", width: "100%", height: "auto" }}
        role="img"
        aria-label={`Waterfall from ${moneyFull(grossRevenue)} mining revenue down to ${moneyFull(net)} net profit.`}
      >
        <line
          x1={L}
          x2={L + pw}
          y1={y(0)}
          y2={y(0)}
          stroke={c.axis}
          strokeWidth={1.4}
        />

        {bars.map((b, i) => {
          const top = Math.min(b.from, b.to);
          const bottom = Math.max(b.from, b.to);
          const fill = b.kind === "in" ? c.primary : c.accent;
          return (
            <g key={b.label}>
              <rect
                x={cx(i) - barW / 2}
                y={y(bottom)}
                width={barW}
                height={Math.max(2, y(top) - y(bottom))}
                fill={fill}
                rx={3}
              />
              <text
                x={cx(i)}
                y={y(bottom) - 8}
                textAnchor="middle"
                fill={fill}
                fontSize={12}
                fontWeight={700}
                fontFamily="ui-monospace, monospace"
              >
                {b.kind === "in" ? "" : "−"}
                {moneyFull(Math.abs(b.delta))}
              </text>
              {i < bars.length - 1 && (
                <line
                  x1={cx(i) + barW / 2}
                  x2={cx(i + 1) - barW / 2}
                  y1={y(b.to)}
                  y2={y(b.to)}
                  stroke={c.axis}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.7}
                />
              )}
              <text
                x={cx(i)}
                y={H - B + 20}
                textAnchor="middle"
                fill={c.axis}
                fontSize={11}
              >
                {b.label}
              </text>
            </g>
          );
        })}

        {/* Final net profit column, drawn from zero */}
        <rect
          x={cx(bars.length) - barW / 2}
          y={y(Math.max(net, 0))}
          width={barW}
          height={Math.max(2, Math.abs(y(net) - y(0)))}
          fill={net >= 0 ? c.good : c.bad}
          rx={3}
        />
        <line
          x1={cx(bars.length - 1) + barW / 2}
          x2={cx(bars.length) - barW / 2}
          y1={y(net)}
          y2={y(net)}
          stroke={c.axis}
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.7}
        />
        <text
          x={cx(bars.length)}
          y={y(Math.max(net, 0)) - 8}
          textAnchor="middle"
          fill={net >= 0 ? c.good : c.bad}
          fontSize={13}
          fontWeight={800}
          fontFamily="ui-monospace, monospace"
        >
          {moneyFull(net)}
        </text>
        <text
          x={cx(bars.length)}
          y={H - B + 20}
          textAnchor="middle"
          fill={c.axis}
          fontSize={11}
          fontWeight={700}
        >
          Your profit
        </text>
      </svg>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Payback by BTC price scenario                                       */
/* ------------------------------------------------------------------ */

export function ScenarioBars({
  scenarios,
  machineLifeMonths,
  currentLabel,
}: {
  scenarios: Array<{
    price: number;
    paybackMonths: number;
    isCurrent: boolean;
  }>;
  machineLifeMonths: number;
  currentLabel: string;
}) {
  const c = useSeriesColors();

  const W = 860;
  const rowH = 34;
  const L = 96;
  const R = 74;
  const T = 26;
  const H = T + scenarios.length * rowH + 26;
  const pw = W - L - R;

  // Anything beyond the machine's life is off the chart, not a longer bar.
  const cap = machineLifeMonths;
  const scale = (m: number) => Math.min(m, cap) / cap;

  return (
    <Box sx={{ minWidth: 620 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", width: "100%", height: "auto" }}
        role="img"
        aria-label="Months to payback at each Bitcoin price scenario."
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={L + pw * f}
              x2={L + pw * f}
              y1={T - 8}
              y2={T + scenarios.length * rowH - 6}
              stroke={c.grid}
              strokeWidth={1}
            />
            <text
              x={L + pw * f}
              y={T - 14}
              textAnchor="middle"
              fill={c.axis}
              fontSize={10}
              fontFamily="ui-monospace, monospace"
            >
              {Math.round(cap * f)} mo
            </text>
          </g>
        ))}

        {scenarios.map((s, i) => {
          const yTop = T + i * rowH;
          const reachable =
            Number.isFinite(s.paybackMonths) && s.paybackMonths <= cap;
          const w = reachable ? pw * scale(s.paybackMonths) : pw;
          const fill = s.isCurrent ? c.accent : c.primary;
          return (
            <g key={`${s.price}-${i}`}>
              <text
                x={L - 12}
                y={yTop + rowH / 2 + 4}
                textAnchor="end"
                fill={c.axis}
                fontSize={11.5}
                fontWeight={s.isCurrent ? 700 : 500}
                fontFamily="ui-monospace, monospace"
              >
                {s.isCurrent
                  ? currentLabel
                  : "$" + (s.price / 1000).toFixed(0) + "k"}
              </text>
              {reachable ? (
                <rect
                  x={L}
                  y={yTop + 6}
                  width={Math.max(2, w)}
                  height={rowH - 14}
                  fill={fill}
                  rx={3}
                />
              ) : (
                <rect
                  x={L}
                  y={yTop + 6}
                  width={pw}
                  height={rowH - 14}
                  fill={c.grid}
                  opacity={0.55}
                  rx={3}
                />
              )}
              <text
                x={reachable ? L + Math.max(2, w) + 8 : L + pw / 2}
                y={yTop + rowH / 2 + 4}
                textAnchor={reachable ? "start" : "middle"}
                fill={reachable ? fill : c.axis}
                fontSize={11.5}
                fontWeight={700}
                fontFamily="ui-monospace, monospace"
              >
                {reachable
                  ? `${Math.round(s.paybackMonths)} mo`
                  : `beyond ${cap / 12}-year life`}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Bitcoin accumulated, year by year                                   */
/* ------------------------------------------------------------------ */

export function BtcAccumulationChart({
  points,
  btcPrice,
}: {
  points: Array<{ year: number; btc: number }>;
  btcPrice: number;
}) {
  const c = useSeriesColors();

  const W = 860;
  const H = 290;
  const L = 78;
  const R = 78;
  const T = 22;
  const B = 42;
  const pw = W - L - R;
  const ph = H - T - B;

  const maxBtc = Math.max(...points.map((p) => p.btc)) * 1.14 || 1;
  const maxYear = Math.max(...points.map((p) => p.year)) || 1;
  const x = (yr: number) => L + (yr / maxYear) * pw;
  const y = (b: number) => T + ((maxBtc - b) / maxBtc) * ph;

  const line = points.map((p) => `${x(p.year)},${y(p.btc)}`).join(" ");
  const area = `${line} ${x(maxYear)},${y(0)} ${x(0)},${y(0)}`;
  const last = points[points.length - 1];

  return (
    <Box sx={{ minWidth: 620 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", width: "100%", height: "auto" }}
        role="img"
        aria-label={`Bitcoin accumulated over ${maxYear} years, reaching ${last.btc.toFixed(8)} BTC.`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = maxBtc * f;
          return (
            <g key={f}>
              <line
                x1={L}
                x2={L + pw}
                y1={y(v)}
                y2={y(v)}
                stroke={c.grid}
                strokeWidth={1}
              />
              <text
                x={L - 9}
                y={y(v) + 3.5}
                textAnchor="end"
                fill={c.axis}
                fontSize={10}
                fontFamily="ui-monospace, monospace"
              >
                {v.toFixed(3)}
              </text>
            </g>
          );
        })}

        <polygon points={area} fill={c.primary} opacity={0.14} />
        <polyline
          points={line}
          fill="none"
          stroke={c.primary}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />

        {points.map((p) => (
          <g key={p.year}>
            <circle
              cx={x(p.year)}
              cy={y(p.btc)}
              r={3.6}
              fill={c.primary}
              stroke={c.surface}
              strokeWidth={2}
            />
            <text
              x={x(p.year)}
              y={H - B + 18}
              textAnchor="middle"
              fill={c.axis}
              fontSize={10.5}
              fontFamily="ui-monospace, monospace"
            >
              {p.year === 0 ? "start" : `yr ${p.year}`}
            </text>
          </g>
        ))}

        <text
          x={x(last.year) + 8}
          y={y(last.btc) + 4}
          fill={c.primary}
          fontSize={12}
          fontWeight={700}
          fontFamily="ui-monospace, monospace"
        >
          ₿ {last.btc.toFixed(4)}
        </text>
        <text
          x={x(last.year) + 8}
          y={y(last.btc) + 19}
          fill={c.axis}
          fontSize={10.5}
          fontFamily="ui-monospace, monospace"
        >
          {moneyFull(last.btc * btcPrice)}
        </text>
      </svg>
    </Box>
  );
}
