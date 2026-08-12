"use client";

/**
 * The graphical half of the payback analysis pages, behind the "Graphical
 * Analysis" switch on both the client and company pages.
 *
 * Presentation only: it never re-derives revenue, payback, ROI or break-even
 * itself. The owning page hands it `calculateAtPrice`, which runs the same
 * `@/lib/helpers/paybackCalculations` engine the data table runs, so a figure
 * drawn here and the same figure in the grid can never disagree.
 *
 * Unlike the grid — pinned to the live price plus fixed scenarios — this view
 * is quoted at a Bitcoin price the viewer drives on a slider, opening on the
 * $150k base case.
 *
 * The strategy, miner and OS all come from the owning page's own selectors, so
 * the Bitcoin price is the only control this view adds.
 */

import { ReactNode, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  InputAdornment,
  Paper,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { formatValue } from "@/lib/helpers/formatValue";
import { PaybackOsFilter } from "@/lib/helpers/paybackChartHeading";
import { PaybackStrategyKey } from "@/lib/helpers/paybackStrategyCopy";
import {
  FIXED_SCENARIO_PRICES,
  MACHINE_LIFE_YEARS,
  MINER_LABELS,
  MinerModel,
  Strategy2Values,
  calculateLifetimeBtc,
} from "@/lib/helpers/paybackCalculations";
import {
  AnswerTile,
  ChartCard,
  HeadroomGauge,
  LegendKey,
  useSeriesColors,
} from "./PaybackChartPrimitives";
import {
  BtcAccumulationChart,
  CashFlowChart,
  ScenarioBars,
  WaterfallChart,
} from "./PaybackCharts";

/** The Bitcoin price the charts open on, before anyone touches the slider. */
export const BASE_CASE_BTC_PRICE = 150_000;

// The track the slider opens on. It is a starting window, not a limit: type
// any price into the field and the track stretches to include it.
const DEFAULT_SLIDER_MIN = 50_000;
const DEFAULT_SLIDER_MAX = 350_000;
const PRICE_SLIDER_STEP = 5_000;

/** Breakpoints to snap to while walking through the numbers. */
const PRICE_MARKS = [
  { value: 150_000, label: "$150k" },
  { value: 200_000, label: "$200k" },
  { value: 250_000, label: "$250k" },
  { value: 300_000, label: "$300k" },
];

const roundToStep = (v: number) =>
  Math.round(v / PRICE_SLIDER_STEP) * PRICE_SLIDER_STEP;

/** Everything the view needs about one miner model, resolved by the page. */
export interface PaybackMinerSpec {
  /** Monthly electricity & hosting bill. */
  hosting: number;
  /** One-off outlay the payback curve has to recover. */
  capital: number;
  /** What is actually paid up front (invoice for a client, cost for company). */
  purchase: number;
  /** Hosting charge per kWh, for the deal breakdown. */
  hostingRate: number;
  powerKw: number;
  hashrateStock: number;
  hashrateLux: number;
}

export interface PaybackGraphicalViewProps {
  miner: MinerModel;
  os: PaybackOsFilter;
  strategy: PaybackStrategyKey;
  /** Network reward in BTC per PH/day, for the assumptions strip. */
  reward: number;
  /** Live market price — offered as a snap target on the slider. */
  liveBtcPrice: number;
  /** Break-even price for the selected miner/OS (independent of the slider). */
  breakevenPrice: number;
  /** Strategy 3 only; zero elsewhere. */
  loanInterest: number;
  /** Resolves the inputs for either miner model. */
  minerSpec: (miner: MinerModel) => PaybackMinerSpec;
  /**
   * Runs the page's model for a miner at an arbitrary Bitcoin price. Returns
   * null until the page's configuration has loaded.
   */
  calculateAtPrice: (
    miner: MinerModel,
    price: number,
  ) => Strategy2Values | null;
  /** Wording for the one-off cost, which differs client vs company. */
  capitalLabel?: string;
  /** Wording for the up-front payment line in the deal breakdown. */
  purchaseLabel?: string;
  /**
   * The "Buy BTC vs Mine BTC" history chart, supplied by the owning page so
   * this view stays free of data fetching. Drawn under the payback curve.
   */
  historyChart?: ReactNode;
}

export default function PaybackGraphicalView({
  miner,
  os,
  strategy,
  reward,
  liveBtcPrice,
  breakevenPrice,
  loanInterest,
  minerSpec,
  calculateAtPrice,
  capitalLabel = "machine cost",
  purchaseLabel = "Paid once, up front",
  historyChart,
}: PaybackGraphicalViewProps) {
  const c = useSeriesColors();

  /** The Bitcoin price every figure below is quoted at. */
  const [btcPrice, setBtcPrice] = useState(BASE_CASE_BTC_PRICE);
  /** What the price field shows — kept as text so it can be typed into. */
  const [priceText, setPriceText] = useState(String(BASE_CASE_BTC_PRICE));

  /** Moves the price from the slider or a shortcut button. */
  const applyPrice = (price: number) => {
    setBtcPrice(price);
    setPriceText(String(Math.round(price)));
  };

  const usesStock = os !== "CUSTOM";
  const pick = (stock: number, lux: number) => (usesStock ? stock : lux);

  const spec = minerSpec(miner);
  const { hosting: monthlyHosting, capital: machineCost } = spec;

  const current = useMemo(
    () => calculateAtPrice(miner, btcPrice),
    [calculateAtPrice, miner, btcPrice],
  );

  // One run per fixed scenario price, so the bar chart and the grid agree.
  const scenarioRuns = useMemo(
    () =>
      FIXED_SCENARIO_PRICES.map((price) => ({
        price,
        values: calculateAtPrice(miner, price),
      })).filter(
        (s): s is { price: number; values: Strategy2Values } =>
          s.values !== null,
      ),
    [calculateAtPrice, miner],
  );

  // The other model, for the side-by-side comparison card.
  const otherModel: MinerModel = miner === "S21PRO" ? "S21XP" : "S21PRO";
  const otherSpec = minerSpec(otherModel);
  const otherCalc = useMemo(
    () => calculateAtPrice(otherModel, btcPrice),
    [calculateAtPrice, otherModel, btcPrice],
  );

  // Yearly BTC totals from the same helper the lifetime figures use, so the
  // 2028 halving bends this curve exactly as it bends the lifetime totals.
  const dailyBtc = current
    ? usesStock
      ? current.dailyBtcStock
      : current.dailyBtcLux
    : 0;
  const btcCurve = useMemo(() => {
    const start = new Date();
    return Array.from({ length: MACHINE_LIFE_YEARS + 1 }, (_, year) => ({
      year,
      btc: year === 0 ? 0 : calculateLifetimeBtc(dailyBtc, start, year),
    }));
  }, [dailyBtc]);

  const money0 = (v: number) =>
    formatValue(v, "currency", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  /* ---------------- Bitcoin price control ---------------- */

  // The track is a window, not a cap: it always stretches to cover whatever
  // price has been typed in, and to reach the live price, so no reachable
  // value ever sits off the end of the slider.
  const sliderMin = Math.max(
    0,
    Math.min(
      DEFAULT_SLIDER_MIN,
      roundToStep(btcPrice) - PRICE_SLIDER_STEP,
      liveBtcPrice > 0
        ? roundToStep(liveBtcPrice) - PRICE_SLIDER_STEP
        : Infinity,
    ),
  );
  const sliderMax = Math.max(
    DEFAULT_SLIDER_MAX,
    roundToStep(btcPrice) + PRICE_SLIDER_STEP,
    liveBtcPrice > 0 ? roundToStep(liveBtcPrice) + PRICE_SLIDER_STEP : 0,
  );
  const sliderMarks = PRICE_MARKS.filter(
    (m) => m.value >= sliderMin && m.value <= sliderMax,
  );

  const priceControls = (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2.5 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
          mb: 0.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Typography
            variant="caption"
            sx={{
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              fontWeight: 600,
              color: "text.secondary",
            }}
          >
            Bitcoin price
          </Typography>
          {/* Typed in, not just dragged — any price is reachable, and the
              slider track below stretches to cover whatever is entered. */}
          <TextField
            value={priceText}
            onChange={(e) => {
              setPriceText(e.target.value);
              const parsed = parseFloat(e.target.value);
              if (Number.isFinite(parsed) && parsed > 0) setBtcPrice(parsed);
            }}
            onBlur={() => setPriceText(String(Math.round(btcPrice)))}
            type="number"
            size="small"
            aria-label="Bitcoin price"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">$</InputAdornment>
              ),
            }}
            inputProps={{ step: PRICE_SLIDER_STEP, min: 0 }}
            sx={{
              width: 150,
              "& input": {
                fontWeight: 700,
                fontSize: "1.1rem",
                fontVariantNumeric: "tabular-nums",
                py: 0.75,
              },
            }}
          />
          {btcPrice === BASE_CASE_BTC_PRICE && (
            <Chip size="small" label="Base case" color="primary" />
          )}
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            size="small"
            variant="text"
            onClick={() => applyPrice(BASE_CASE_BTC_PRICE)}
            disabled={btcPrice === BASE_CASE_BTC_PRICE}
          >
            Reset to $150k
          </Button>
          {liveBtcPrice > 0 && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => applyPrice(roundToStep(liveBtcPrice))}
            >
              Use live price ({money0(liveBtcPrice)})
            </Button>
          )}
        </Box>
      </Box>

      <Box sx={{ px: { xs: 1, sm: 1.5 } }}>
        <Slider
          value={Math.min(Math.max(btcPrice, sliderMin), sliderMax)}
          onChange={(_e, v) => applyPrice(v as number)}
          min={sliderMin}
          max={sliderMax}
          step={PRICE_SLIDER_STEP}
          marks={sliderMarks}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => money0(v)}
          aria-label="Bitcoin price scenario"
          sx={{
            "& .MuiSlider-markLabel": {
              fontSize: "0.72rem",
              fontVariantNumeric: "tabular-nums",
            },
            "& .MuiSlider-mark": { height: 8, width: 2 },
          }}
        />
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            mt: -0.5,
            color: "text.secondary",
            fontSize: "0.7rem",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>{money0(sliderMin)}</span>
          <span>{money0(sliderMax)}</span>
        </Box>
      </Box>
    </Paper>
  );

  if (!current) {
    return (
      <Box>
        {priceControls}
        <Alert severity="info">
          Charts will appear once the payback model has finished calculating.
        </Alert>
      </Box>
    );
  }

  /* ---------------- pick the numbers for the chosen OS ---------------- */

  const monthlyRevenue = pick(
    current.monthlyRevenueStock,
    current.monthlyRevenueLux,
  );
  const netRevenue = pick(current.netRevenueStock, current.netRevenueLux);
  const paybackMonths = pick(
    current.paybackMonthsStock,
    current.paybackMonthsLux,
  );
  const lifetimeBtc = pick(current.lifetimeBtcStock, current.lifetimeBtcLux);
  const lifetimeRevenue = pick(
    current.lifetimeRevenueStock,
    current.lifetimeRevenueLux,
  );
  const netProfit = pick(
    current.netProfitLifetimeStock,
    current.netProfitLifetimeLux,
  );
  const returnMultiple = pick(
    current.returnMultipleStock,
    current.returnMultipleLux,
  );
  const roiLifetime = pick(current.roiLifetimeStock, current.roiLifetimeLux);
  const roiPerYear = pick(current.roiPerYearStock, current.roiPerYearLux);

  const machineLifeMonths = MACHINE_LIFE_YEARS * 12;
  const paybackReached =
    Number.isFinite(paybackMonths) && paybackMonths <= machineLifeMonths;
  const holdsBtc = strategy !== "STRATEGY_1";
  const totalCashIn =
    machineCost + monthlyHosting * machineLifeMonths + loanInterest;
  const headroomPct =
    btcPrice > 0 ? ((btcPrice - breakevenPrice) / btcPrice) * 100 : 0;

  const assumptionStrip = [
    `Bitcoin held at ${money0(btcPrice)}`,
    `network reward ${reward.toFixed(8)} BTC per PH/day`,
    `${MINER_LABELS[miner]} at ${formatValue(
      usesStock ? spec.hashrateStock : spec.hashrateLux,
      "number",
      { minimumFractionDigits: 0, maximumFractionDigits: 0 },
    )} TH/s`,
    `${usesStock ? "standard" : "optimised"} firmware`,
    `hosting ${formatValue(monthlyHosting, "currency")}/month`,
    `${MACHINE_LIFE_YEARS}-year life`,
  ].join(" · ");

  return (
    <Box>
      {priceControls}

      {/* ============ the answer ============ */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            lg: "repeat(4, 1fr)",
          },
          gap: 1.5,
          mb: 1.5,
        }}
      >
        <AnswerTile
          emphasis
          label="Money back in"
          value={
            paybackReached
              ? `${Math.round(paybackMonths)} months`
              : `Beyond ${MACHINE_LIFE_YEARS} yrs`
          }
          note={
            paybackReached
              ? `Around ${new Date(
                  new Date().setMonth(
                    new Date().getMonth() + Math.round(paybackMonths),
                  ),
                ).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}`
              : `At this Bitcoin price the ${capitalLabel} is not recovered within the machine's life`
          }
        />
        <AnswerTile
          label={`Profit over ${MACHINE_LIFE_YEARS} years`}
          value={money0(netProfit)}
          tone={netProfit >= 0 ? "good" : "bad"}
          note={`After the ${capitalLabel}, all hosting and power`}
        />
        <AnswerTile
          label="Return multiple"
          value={`${returnMultiple.toFixed(2)}×`}
          note={`On ${money0(totalCashIn)} total cash in`}
        />
        <AnswerTile
          label="Bitcoin mined"
          value={`₿ ${lifetimeBtc.toFixed(4)}`}
          note={`Worth ${money0(lifetimeRevenue)} at this price`}
        />
      </Box>

      <Alert
        severity="info"
        variant="outlined"
        icon={false}
        sx={{ mb: 3, py: 0.75, "& .MuiAlert-message": { width: "100%" } }}
      >
        <Typography
          variant="body2"
          sx={{ fontSize: "0.8rem", lineHeight: 1.55 }}
        >
          <strong>These figures assume:</strong> {assumptionStrip}. Mining
          rewards are held at today&apos;s network rate for the full term; the
          April 2028 halving is applied to lifetime Bitcoin totals.
        </Typography>
      </Alert>

      {/* ============ charts ============ */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 2, mb: 2 }}>
        <ChartCard
          title="When you get your money back"
          subtitle={`Your position month by month — starting from the day you pay, ending ${MACHINE_LIFE_YEARS} years later.`}
          legend={
            <>
              <LegendKey color={c.primary} label="Your cumulative position" />
              <LegendKey color={c.good} label="Break-even point" dashed />
            </>
          }
        >
          <CashFlowChart
            monthlyNetRevenue={netRevenue}
            machineCost={machineCost}
            months={machineLifeMonths}
            paybackMonths={paybackMonths}
          />
        </ChartCard>

        {/* The grid's own gap handles the spacing, so drop the chart's margin. */}
        {historyChart && <Box sx={{ "& > *": { mb: 0 } }}>{historyChart}</Box>}

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
            gap: 2,
          }}
        >
          <ChartCard
            title="What kills it"
            subtitle="The Bitcoin price at which this miner stops covering its monthly bill."
          >
            <HeadroomGauge
              currentPrice={btcPrice}
              shutdownPrice={breakevenPrice}
            />
          </ChartCard>

          <ChartCard
            title="Where the money goes"
            subtitle={`Everything this machine earns and spends over ${MACHINE_LIFE_YEARS} years.`}
          >
            <WaterfallChart
              grossRevenue={lifetimeRevenue}
              hostingCost={current.lifetimeElectricityHostingCharges}
              machineCost={machineCost}
              loanInterest={loanInterest}
            />
          </ChartCard>
        </Box>

        <ChartCard
          title="If Bitcoin goes higher"
          subtitle="Months to get your money back at each Bitcoin price. The price on the slider is highlighted."
        >
          <ScenarioBars
            currentLabel={money0(btcPrice).replace(".00", "")}
            machineLifeMonths={machineLifeMonths}
            scenarios={[
              { price: btcPrice, paybackMonths, isCurrent: true },
              // Skip a fixed scenario that duplicates the slider price, so the
              // chart never shows the same price twice.
              ...scenarioRuns
                .filter((s) => s.price !== btcPrice)
                .map((s) => ({
                  price: s.price,
                  paybackMonths: pick(
                    s.values.paybackMonthsStock,
                    s.values.paybackMonthsLux,
                  ),
                  isCurrent: false,
                })),
              // Price order, so payback shortens steadily down the chart.
            ].sort((a, b) => a.price - b.price)}
          />
        </ChartCard>

        {holdsBtc && (
          <ChartCard
            title="Your Bitcoin stack"
            subtitle="Bitcoin accumulated if you never sell. The curve flattens after the April 2028 halving."
          >
            <BtcAccumulationChart points={btcCurve} btcPrice={btcPrice} />
          </ChartCard>
        )}
      </Box>

      {/* ============ deal + comparison ============ */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
          gap: 2,
          mb: 2,
        }}
      >
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Typography sx={{ fontWeight: 650, fontSize: "1rem", mb: 1.5 }}>
            The deal in plain terms
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
            {(
              [
                [
                  purchaseLabel,
                  formatValue(spec.purchase, "currency"),
                  `Recovered by the payback curve as ${money0(machineCost)} of ${capitalLabel}`,
                ],
                [
                  "Paid monthly",
                  formatValue(monthlyHosting, "currency"),
                  `${formatValue(spec.powerKw, "number", { maximumFractionDigits: 2 })} kW at ${formatValue(spec.hostingRate, "currency", { minimumFractionDigits: 5, maximumFractionDigits: 5 })} per kWh, all in`,
                ],
                [
                  "Earned monthly",
                  formatValue(monthlyRevenue, "currency"),
                  `Gross mining revenue at ${money0(btcPrice)} BTC`,
                ],
                [
                  "Kept monthly",
                  formatValue(netRevenue, "currency"),
                  "After hosting and power",
                ],
              ] as Array<[string, string, string]>
            ).map(([k, v, note]) => (
              <Box key={k}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 2,
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {k}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {v}
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", fontSize: "0.73rem" }}
                >
                  {note}
                </Typography>
              </Box>
            ))}
          </Box>
          <Divider sx={{ my: 1.75 }} />
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Chip
              size="small"
              label={`Return on cost ${roiLifetime.toFixed(0)}%`}
              color={roiLifetime >= 0 ? "success" : "error"}
              variant="outlined"
            />
            <Chip
              size="small"
              label={`${roiPerYear.toFixed(1)}% a year`}
              variant="outlined"
            />
            <Chip
              size="small"
              label={`${headroomPct.toFixed(0)}% price headroom`}
              color={headroomPct > 0 ? "success" : "error"}
              variant="outlined"
            />
          </Box>
        </Paper>

        {otherCalc && (
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Typography sx={{ fontWeight: 650, fontSize: "1rem", mb: 0.5 }}>
              Compare the two machines
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", fontSize: "0.8rem", mb: 1.5 }}
            >
              Same firmware and Bitcoin price. Each machine carries its own
              monthly bill and the capital entered against it.
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>—</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {MINER_LABELS[miner]}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {MINER_LABELS[otherModel]}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(
                    [
                      [
                        "Payback",
                        paybackReached
                          ? `${Math.round(paybackMonths)} mo`
                          : "—",
                        (() => {
                          const p = pick(
                            otherCalc.paybackMonthsStock,
                            otherCalc.paybackMonthsLux,
                          );
                          return Number.isFinite(p) && p <= machineLifeMonths
                            ? `${Math.round(p)} mo`
                            : "—";
                        })(),
                      ],
                      [
                        "Monthly kept",
                        formatValue(netRevenue, "currency"),
                        formatValue(
                          pick(
                            otherCalc.netRevenueStock,
                            otherCalc.netRevenueLux,
                          ),
                          "currency",
                        ),
                      ],
                      [
                        `${MACHINE_LIFE_YEARS}-yr profit`,
                        money0(netProfit),
                        money0(
                          pick(
                            otherCalc.netProfitLifetimeStock,
                            otherCalc.netProfitLifetimeLux,
                          ),
                        ),
                      ],
                      [
                        "Bitcoin mined",
                        `₿ ${lifetimeBtc.toFixed(4)}`,
                        `₿ ${pick(
                          otherCalc.lifetimeBtcStock,
                          otherCalc.lifetimeBtcLux,
                        ).toFixed(4)}`,
                      ],
                      [
                        "Monthly bill",
                        formatValue(monthlyHosting, "currency"),
                        formatValue(otherSpec.hosting, "currency"),
                      ],
                    ] as Array<[string, string, string]>
                  ).map(([label, a, b]) => (
                    <TableRow key={label}>
                      <TableCell sx={{ fontWeight: 600 }}>{label}</TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {a}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontVariantNumeric: "tabular-nums",
                          color: "text.secondary",
                        }}
                      >
                        {b}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
      </Box>

      <Typography
        variant="caption"
        sx={{
          display: "block",
          color: "text.secondary",
          fontSize: "0.72rem",
          lineHeight: 1.6,
        }}
      >
        Projections, not guarantees. Mining revenue depends on the Bitcoin price
        and on total network computing power, both of which change. Figures
        assume the machine runs continuously for its full {MACHINE_LIFE_YEARS}
        -year life at today&apos;s network reward rate. Switch to the scenario
        table for the same model at every fixed price column.
      </Typography>
    </Box>
  );
}
