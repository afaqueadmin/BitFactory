"use client";

/**
 * Company Payback Analysis page - BitFactory Daylight theme (v1.3)
 *
 * Mirrors the client payback-analysis page: the default "Scenario Table" view
 * is fully re-themed, while the shared "Graphical Analysis" view keeps its
 * current MUI-theme-based look.
 */

import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  useMediaQuery,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatValue } from "@/lib/helpers/formatValue";
import PaybackHistoryChart from "@/components/PaybackHistoryChart";
import PaybackGraphicalView, {
  PaybackMinerSpec,
} from "@/components/payback/PaybackGraphicalView";
import {
  PaybackStrategyKey,
  STRATEGY_COPY,
} from "@/lib/helpers/paybackStrategyCopy";
import { fetchLiveBtcPrice } from "@/lib/services/btcPriceService";
import {
  MinerModel,
  MINER_LABELS,
  FALLBACK_BTC_PRICE,
  FALLBACK_REWARD_BTC_PER_PH_DAY,
  FIXED_SCENARIO_PRICES,
  MACHINE_LIFE_YEARS,
  BORROWING_RATE_APR,
  Strategy2Values,
  calculateBreakevenBtcPrice,
  calculateLoanInterest,
  calculateMonthlyDepreciationValues,
  calculateStrategy2Values,
  calculateStrategy3Values,
} from "@/lib/helpers/paybackCalculations";
import { usePaybackHistory } from "@/hooks/usePaybackHistory";
import {
  BASE_CASE_HALVINGS,
  LIFETIME_BTC_NOTE,
  buildPaybackBaseCase,
} from "@/lib/helpers/paybackBaseCase";
import Segmented, { SegmentedOption } from "@/components/daylight/Segmented";
import ToggleChip from "@/components/daylight/ToggleChip";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

type PaybackStrategy = PaybackStrategyKey;
type ViewMode = "TABLE" | "GRAPHS";
type OsSelection = "STOCK" | "CUSTOM";

const OS_LABELS: Record<OsSelection, string> = {
  STOCK: "Stock OS",
  CUSTOM: "Custom OS",
};

const VIEW_OPTIONS: SegmentedOption<ViewMode>[] = [
  { id: "TABLE", label: "Scenario Table" },
  { id: "GRAPHS", label: "Graphical Analysis" },
];

const STRATEGY_OPTIONS: SegmentedOption<PaybackStrategy>[] = [
  { id: "STRATEGY_0", label: "Strategy 0" },
  { id: "STRATEGY_1A", label: "Strategy 1A" },
  { id: "STRATEGY_1B", label: "Strategy 1B" },
  { id: "STRATEGY_2", label: "Strategy 2" },
  { id: "STRATEGY_3", label: "Strategy 3" },
];

const MINER_OPTIONS: SegmentedOption<MinerModel>[] = [
  { id: "S21PRO", label: "S21 Pro" },
  { id: "S21XP", label: "S21 XP" },
];

const OS_OPTIONS: SegmentedOption<OsSelection>[] = [
  { id: "STOCK", label: "Stock OS" },
  { id: "CUSTOM", label: "Custom OS" },
];

// CURRENT (live price), one column per fixed scenario price, then BREAKEVEN.
// With machine depreciation on, a second breakeven column is appended.
const BASE_COLUMNS = [
  "CURRENT",
  ...FIXED_SCENARIO_PRICES.map((_, i) => `Scenario: ${i + 1}`),
  "BREAKEVEN\n(Hosting Charges)",
];
const BREAKEVEN_COLUMN = BASE_COLUMNS.length - 1;
const DEPRECIATION_BREAKEVEN_COLUMN = BASE_COLUMNS.length;

// Data Sources:
// - BTC Price: CoinGecko API (live market price)
// - Hashprice: Live pool-wide Luxor API (/api/pool-hashprice-live - real-time summary)

// Interface for config data from API
interface PaybackConfigData {
  s21proHostingCharges: number;
  s21xpHostingCharges: number;
  s21proMonthlyInvoicingAmount: number;
  s21xpMonthlyInvoicingAmount: number;
  s21proPowerConsumption: number;
  s21xpPowerConsumption: number;
  s21proMachineCost: number;
  s21xpMachineCost: number;
  poolCommissionStockOs: number;
  poolCommissionLuxos: number;
  s21proHashrateStockOs: number;
  s21proHashrateLuxos: number;
  s21xpHashrateStockOs: number;
  s21xpHashrateLuxos: number;
  breakevenBtcPrice: number;
}

/** A label/value pair in the config summary fact sheet. */
function Fact({ label, value }: { label: string; value: string }) {
  const { d, fonts } = useDaylight();
  return (
    <Box>
      <Typography sx={{ fontSize: 11, color: d.muted, fontFamily: fonts.body }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 600,
          color: d.text,
          mt: "2px",
          fontFamily: fonts.body,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export default function PaybackAnalysisCompanyPage() {
  const { d, fonts } = useDaylight();
  const isMobile = useMediaQuery("(max-width:599.95px)");

  // Config state
  const [config, setConfig] = useState<PaybackConfigData | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  // Editable machine cost (per miner model) / operating cost state
  const [editableS21ProMachineCost, setEditableS21ProMachineCost] =
    useState<string>("");
  const [editableS21XpMachineCost, setEditableS21XpMachineCost] =
    useState<string>("");
  const [editableS21ProOperatingCost, setEditableS21ProOperatingCost] =
    useState<string>("");
  const [editableS21XpOperatingCost, setEditableS21XpOperatingCost] =
    useState<string>("");
  const [isSavingCosts, setIsSavingCosts] = useState(false);
  const [costsUpdateSuccess, setCostsUpdateSuccess] = useState<string | null>(
    null,
  );
  const [costsUpdateError, setCostsUpdateError] = useState<string | null>(null);

  // Price and reward state
  const [liveBtcPrice, setLiveBtcPrice] = useState<string | null>(null);
  const [liveBtcPriceValue, setLiveBtcPriceValue] = useState<number | null>(
    null,
  );
  const [liveRewardBtcPerPhDay, setLiveRewardBtcPerPhDay] = useState<
    number | null
  >(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Strategy selector state
  const [selectedStrategy, setSelectedStrategy] =
    useState<PaybackStrategy>("STRATEGY_1B");

  // Adds monthly depreciation, net profit and ROI rows (Strategy 0, 1A & 1B only)
  const [includeDepreciation, setIncludeDepreciation] = useState(false);
  const supportsDepreciation =
    selectedStrategy === "STRATEGY_0" ||
    selectedStrategy === "STRATEGY_1A" ||
    selectedStrategy === "STRATEGY_1B";
  const showDepreciationRows = supportsDepreciation && includeDepreciation;

  // OS selector state
  const [selectedOS, setSelectedOS] = useState<OsSelection>("STOCK");

  // Miner selector state
  const [selectedMiner, setSelectedMiner] = useState<MinerModel>("S21PRO");

  // Which half of the analysis is on screen: the scenario grid, or the charts.
  const [viewMode, setViewMode] = useState<ViewMode>("TABLE");

  // Fetch config from API
  const fetchConfig = useCallback(async () => {
    try {
      setConfigLoading(true);
      setConfigError(null);
      const response = await fetch("/api/payback-config-company");
      if (!response.ok) {
        throw new Error("Failed to fetch configuration");
      }
      const data = await response.json();
      if (data.success && data.data) {
        setConfig(data.data);
        setEditableS21ProMachineCost(String(data.data.s21proMachineCost));
        setEditableS21XpMachineCost(String(data.data.s21xpMachineCost));
        setEditableS21ProOperatingCost(
          String(data.data.s21proMonthlyInvoicingAmount),
        );
        setEditableS21XpOperatingCost(
          String(data.data.s21xpMonthlyInvoicingAmount),
        );
      } else {
        throw new Error(data.error || "Invalid configuration data");
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Failed to load configuration";
      setConfigError(errorMsg);
      console.error("[Company Payback Analysis] Config fetch error:", error);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  // Save machine costs (per miner model) & operating cost to the database
  const handleSaveCosts = useCallback(async () => {
    const s21proMachineCostValue = parseFloat(editableS21ProMachineCost);
    const s21xpMachineCostValue = parseFloat(editableS21XpMachineCost);
    const s21proOperatingCostValue = parseFloat(editableS21ProOperatingCost);
    const s21xpOperatingCostValue = parseFloat(editableS21XpOperatingCost);

    if (
      !Number.isFinite(s21proMachineCostValue) ||
      s21proMachineCostValue < 0
    ) {
      setCostsUpdateError("Please enter a valid S21 Pro machine cost");
      return;
    }
    if (!Number.isFinite(s21xpMachineCostValue) || s21xpMachineCostValue < 0) {
      setCostsUpdateError("Please enter a valid S21 XP machine cost");
      return;
    }
    if (
      !Number.isFinite(s21proOperatingCostValue) ||
      s21proOperatingCostValue < 0
    ) {
      setCostsUpdateError("Please enter a valid S21 Pro operating cost");
      return;
    }
    if (
      !Number.isFinite(s21xpOperatingCostValue) ||
      s21xpOperatingCostValue < 0
    ) {
      setCostsUpdateError("Please enter a valid S21 XP operating cost");
      return;
    }

    try {
      setIsSavingCosts(true);
      setCostsUpdateError(null);
      setCostsUpdateSuccess(null);

      const response = await fetch("/api/admin/payback-config-company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          s21proMachineCost: s21proMachineCostValue,
          s21xpMachineCost: s21xpMachineCostValue,
          s21proMonthlyInvoicingAmount: s21proOperatingCostValue,
          s21xpMonthlyInvoicingAmount: s21xpOperatingCostValue,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save configuration");
      }

      setConfig((prev) =>
        prev
          ? {
              ...prev,
              s21proMachineCost: s21proMachineCostValue,
              s21xpMachineCost: s21xpMachineCostValue,
              s21proMonthlyInvoicingAmount: s21proOperatingCostValue,
              s21xpMonthlyInvoicingAmount: s21xpOperatingCostValue,
            }
          : prev,
      );
      setCostsUpdateSuccess("Costs saved successfully!");
      setTimeout(() => setCostsUpdateSuccess(null), 3000);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Failed to save configuration";
      setCostsUpdateError(errorMsg);
    } finally {
      setIsSavingCosts(false);
    }
  }, [
    editableS21ProMachineCost,
    editableS21XpMachineCost,
    editableS21ProOperatingCost,
    editableS21XpOperatingCost,
  ]);

  const fetchLivePrice = useCallback(async () => {
    try {
      setIsRefreshing(true);
      setLastUpdated(new Date());
      const data = await fetchLiveBtcPrice();
      const price = Number(data.price);
      if (!Number.isFinite(price) || price <= 0) return;
      setLiveBtcPriceValue(price);
      setLiveBtcPrice(
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(price),
      );
    } catch (err) {
      console.warn(
        "[Admin Payback Analysis] Failed to fetch live BTC price:",
        err,
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const fetchLuxorReward = useCallback(async () => {
    try {
      // Use live pool-wide hashprice API to get real-time value for all users
      const response = await fetch("/api/pool-hashprice-live", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) return;
      const data = (await response.json()) as {
        success: boolean;
        data?: {
          hashprice: number;
          hashrate_5m: string;
          hashrate_24h: string;
        };
      };

      if (!data.success || !data.data || !Number.isFinite(data.data.hashprice))
        return;

      const rewardBtcPerPhDay = data.data.hashprice;

      setLiveRewardBtcPerPhDay(rewardBtcPerPhDay);
    } catch {
      // ignore and keep fallback
    }
  }, []);

  const resolvedBtcPriceValue = liveBtcPriceValue ?? FALLBACK_BTC_PRICE;
  const resolvedRewardBtcPerPhDay =
    liveRewardBtcPerPhDay ?? FALLBACK_REWARD_BTC_PER_PH_DAY;

  // The machine cost input tracks whichever miner model tab is active
  const editableActiveMachineCost =
    selectedMiner === "S21XP"
      ? editableS21XpMachineCost
      : editableS21ProMachineCost;
  const setEditableActiveMachineCost =
    selectedMiner === "S21XP"
      ? setEditableS21XpMachineCost
      : setEditableS21ProMachineCost;

  // The operating cost input tracks whichever miner model tab is active
  const editableActiveOperatingCost =
    selectedMiner === "S21XP"
      ? editableS21XpOperatingCost
      : editableS21ProOperatingCost;
  const setEditableActiveOperatingCost =
    selectedMiner === "S21XP"
      ? setEditableS21XpOperatingCost
      : setEditableS21ProOperatingCost;

  // Everything the model needs about one miner model, taken from the editable
  // fields so the page recalculates live as the user types before saving.
  // Resolving both models through one function lets the graphical view chart
  // either of them without the page duplicating the lookups.
  const minerSpec = useCallback(
    (miner: MinerModel): PaybackMinerSpec => {
      if (!config) {
        return {
          hosting: 0,
          capital: 0,
          purchase: 0,
          hostingRate: 0,
          powerKw: 0,
          hashrateStock: 0,
          hashrateLux: 0,
        };
      }
      const isXp = miner === "S21XP";
      // Company self-mining: the capital outlay is the machine's own cost,
      // there is no client invoice to offset against.
      const capital =
        parseFloat(
          isXp ? editableS21XpMachineCost : editableS21ProMachineCost,
        ) || 0;

      return {
        hosting:
          parseFloat(
            isXp ? editableS21XpOperatingCost : editableS21ProOperatingCost,
          ) || 0,
        capital,
        purchase: capital,
        hostingRate: isXp
          ? config.s21xpHostingCharges
          : config.s21proHostingCharges,
        powerKw: isXp
          ? config.s21xpPowerConsumption
          : config.s21proPowerConsumption,
        hashrateStock: isXp
          ? config.s21xpHashrateStockOs
          : config.s21proHashrateStockOs,
        hashrateLux: isXp
          ? config.s21xpHashrateLuxos
          : config.s21proHashrateLuxos,
      };
    },
    [
      config,
      editableS21ProMachineCost,
      editableS21XpMachineCost,
      editableS21ProOperatingCost,
      editableS21XpOperatingCost,
    ],
  );

  // Runs the model for either miner at any BTC price. Both the scenario table
  // and the graphical view go through this, so they cannot disagree.
  const calculateAtPrice = useCallback(
    (miner: MinerModel, price: number): Strategy2Values | null => {
      if (!config) return null;
      const spec = minerSpec(miner);
      // Strategy 3 funds the bills with a collateralised loan, so its profit
      // and return figures are net of the interest that loan accrues.
      const calculate =
        selectedStrategy === "STRATEGY_3"
          ? calculateStrategy3Values
          : calculateStrategy2Values;

      return calculate(
        price,
        resolvedRewardBtcPerPhDay,
        spec.hashrateStock,
        spec.hashrateLux,
        config.poolCommissionStockOs,
        config.poolCommissionLuxos,
        spec.hosting,
        spec.capital,
      );
    },
    [config, minerSpec, selectedStrategy, resolvedRewardBtcPerPhDay],
  );

  // Derived values for the currently selected miner model
  const activeSpec = minerSpec(selectedMiner);
  const monthlyElectricityHosting = activeSpec.hosting;
  const machineCost = activeSpec.capital;
  const activeHashrateStockOs = activeSpec.hashrateStock;
  const activeHashrateLuxos = activeSpec.hashrateLux;

  // Strategy 0, 1A & 1B add a "cost incl. depreciation" line to the history chart.
  const chartDepreciation =
    includeDepreciation &&
    config &&
    (selectedStrategy === "STRATEGY_0" ||
      selectedStrategy === "STRATEGY_1A" ||
      selectedStrategy === "STRATEGY_1B")
      ? {
          monthlyDepreciation: machineCost / (MACHINE_LIFE_YEARS * 12),
          hashrateTh:
            selectedOS === "STOCK"
              ? activeHashrateStockOs
              : activeHashrateLuxos,
          poolCommission:
            selectedOS === "STOCK"
              ? config.poolCommissionStockOs
              : config.poolCommissionLuxos,
        }
      : undefined;
  const activeHostingCharges = activeSpec.hostingRate;
  const activePowerConsumption = activeSpec.powerKw;

  // Strategy 3 borrows each month's bill, so interest depends only on the
  // hosting charge and the machine's life — not on any BTC price scenario.
  const loanInterest = calculateLoanInterest(monthlyElectricityHosting);

  // Hashrate for whichever miner/OS the selectors are on.
  const formatHashrate = (th: number) =>
    `${formatValue(th, "number", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} TH/s`;
  const activeHashrateSummary = formatHashrate(
    selectedOS === "CUSTOM" ? activeHashrateLuxos : activeHashrateStockOs,
  );

  // Calculate breakeven BTC prices for both OS types
  const breakevenBtcPriceStock = config
    ? calculateBreakevenBtcPrice(
        monthlyElectricityHosting,
        resolvedRewardBtcPerPhDay,
        activeHashrateStockOs,
        config.poolCommissionStockOs,
        config.breakevenBtcPrice,
      )
    : 0;

  const breakevenBtcPriceCustom = config
    ? calculateBreakevenBtcPrice(
        monthlyElectricityHosting,
        resolvedRewardBtcPerPhDay,
        activeHashrateLuxos,
        config.poolCommissionLuxos,
        config.breakevenBtcPrice,
      )
    : 0;

  // Select breakeven price based on selected OS
  const selectedBreakevenPrice =
    selectedOS === "CUSTOM" ? breakevenBtcPriceCustom : breakevenBtcPriceStock;

  // Breakeven once the machine cost (written off over its life) is added to
  // the monthly bill — the price at which monthly net profit is zero.
  const depreciationBreakevenPrice = config
    ? calculateBreakevenBtcPrice(
        monthlyElectricityHosting + machineCost / (MACHINE_LIFE_YEARS * 12),
        resolvedRewardBtcPerPhDay,
        selectedOS === "CUSTOM" ? activeHashrateLuxos : activeHashrateStockOs,
        selectedOS === "CUSTOM"
          ? config.poolCommissionLuxos
          : config.poolCommissionStockOs,
        config.breakevenBtcPrice,
      )
    : 0;

  // Strategy 2 & 3 run over the machine's life, mostly after the 2028
  // halving, so they highlight a base-case column per halving: today's
  // mining cost x2 (2028) or x4 (2032), plus the past year's average mining
  // advantage from the company's own Buy vs Mine history. Recomputed from
  // live data on every load.
  const showBaseCase =
    selectedStrategy === "STRATEGY_2" || selectedStrategy === "STRATEGY_3";
  const { historyData: baseCaseHistory } = usePaybackHistory(
    "COMPANY",
    selectedMiner,
    "1Y",
  );
  const baseCases = useMemo(
    () =>
      showBaseCase
        ? BASE_CASE_HALVINGS.flatMap((halving) => {
            const baseCase = buildPaybackBaseCase(
              selectedBreakevenPrice,
              baseCaseHistory,
              selectedOS,
              FIXED_SCENARIO_PRICES,
              halving.costMultiplier,
            );
            return baseCase ? [{ ...halving, ...baseCase }] : [];
          })
        : [],
    [showBaseCase, selectedBreakevenPrice, baseCaseHistory, selectedOS],
  );
  const baseCaseTone = (year: number) =>
    year === 2028
      ? { soft: d.skySoft, strong: d.action }
      : { soft: d.mint, strong: d.success };
  // Column 0 is CURRENT, so scenario i sits at column i + 1.
  const baseCaseByColumn = new Map(
    baseCases.map((baseCase) => [baseCase.scenarioIndex + 1, baseCase]),
  );
  const baseCaseCellSx = (index: number) => {
    const baseCase = baseCaseByColumn.get(index);
    if (!baseCase) return {};
    const tone = baseCaseTone(baseCase.year);
    return {
      backgroundColor: tone.soft,
      borderLeft: `2px solid ${tone.strong}`,
      borderRight: `2px solid ${tone.strong}`,
    };
  };
  const formatWholeUsd = (value: number) =>
    formatValue(value, "currency", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  const columns = (
    showDepreciationRows
      ? [...BASE_COLUMNS, "BREAKEVEN\n(incl. Depreciation)"]
      : BASE_COLUMNS
  ).map((column, index) => {
    const baseCase = baseCaseByColumn.get(index);
    return baseCase ? `${column}\n${baseCase.shortLabel}` : column;
  });

  // Index 0 is CURRENT (live BTC price), then one column per scenario price:
  // the fixed steps, the calculated breakeven, and (optionally) the breakeven
  // incl. depreciation. Derived in render so it always matches `columns`.
  const calculatedValues = useMemo(() => {
    const prices = [
      resolvedBtcPriceValue,
      ...FIXED_SCENARIO_PRICES,
      selectedBreakevenPrice,
      ...(showDepreciationRows ? [depreciationBreakevenPrice] : []),
    ];

    return prices
      .map((price) => calculateAtPrice(selectedMiner, price))
      .filter((values): values is Strategy2Values => values !== null);
  }, [
    calculateAtPrice,
    selectedMiner,
    resolvedBtcPriceValue,
    selectedBreakevenPrice,
    showDepreciationRows,
    depreciationBreakevenPrice,
  ]);

  // Fetch config on mount
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchLivePrice();
    fetchLuxorReward();
  }, [fetchLivePrice, fetchLuxorReward]);

  const handleRefresh = useCallback(async () => {
    await fetchLivePrice();
    await fetchLuxorReward();
  }, [fetchLivePrice, fetchLuxorReward]);

  const btcPriceRow = {
    label: "BTC Price (USD)",
    values: [
      liveBtcPrice || formatValue(resolvedBtcPriceValue, "currency"),
      ...FIXED_SCENARIO_PRICES.map(
        (price) => `$${price.toLocaleString("en-US")}`,
      ),
      formatValue(selectedBreakevenPrice, "currency"),
      ...(showDepreciationRows
        ? [formatValue(depreciationBreakevenPrice, "currency")]
        : []),
    ],
  };

  const rewardRow = {
    label: "Reward (BTC/PH/Day)",
    values: Array.from({ length: columns.length }, () =>
      resolvedRewardBtcPerPhDay.toFixed(8),
    ),
  };

  // Build static rows from config
  const allStaticRows: Array<{
    label: string;
    values: Array<string | number>;
  }> = config
    ? [
        {
          label: "Pool Commission (Stock OS)",
          values: Array.from(
            { length: columns.length },
            () => `${config.poolCommissionStockOs.toFixed(2)}%`,
          ),
        },
        {
          label: "Pool Commission (Custom OS)",
          values: Array.from(
            { length: columns.length },
            () => `${config.poolCommissionLuxos.toFixed(2)}%`,
          ),
        },
        {
          label: `${MINER_LABELS[selectedMiner]} Hashrate (TH) (Stock OS)`,
          values: Array.from({ length: columns.length }, () =>
            formatValue(activeHashrateStockOs, "number", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
          ),
        },
        {
          label: `${MINER_LABELS[selectedMiner]} Hashrate (TH) (Custom OS)`,
          values: Array.from({ length: columns.length }, () =>
            formatValue(activeHashrateLuxos, "number", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
          ),
        },
      ]
    : [];

  // Build dynamic rows for calculated values
  const allDynamicRows: Array<{
    label: string;
    values: Array<string | number>;
  }> = [];

  if (calculatedValues.length > 0 && config) {
    allDynamicRows.push({
      label: "Daily BTC Reward (Stock OS)",
      values: calculatedValues.map((calc) => calc.dailyBtcStock.toFixed(8)),
    });
    allDynamicRows.push({
      label: "Daily BTC Reward (Custom OS)",
      values: calculatedValues.map((calc) => calc.dailyBtcLux.toFixed(8)),
    });
    allDynamicRows.push({
      label: "Monthly Revenue (Stock OS)",
      values: calculatedValues.map((calc) =>
        formatValue(calc.monthlyRevenueStock, "currency"),
      ),
    });
    allDynamicRows.push({
      label: "Monthly Revenue (Custom OS)",
      values: calculatedValues.map((calc) =>
        formatValue(calc.monthlyRevenueLux, "currency"),
      ),
    });
    allDynamicRows.push({
      label: "Electricity & Hosting Charges",
      values: Array.from({ length: columns.length }, () =>
        formatValue(monthlyElectricityHosting, "currency"),
      ),
    });
    allDynamicRows.push({
      label: "Net Revenue (Stock OS)",
      values: calculatedValues.map((calc) =>
        formatValue(calc.netRevenueStock, "currency"),
      ),
    });
    allDynamicRows.push({
      label: "Net Revenue (Custom OS)",
      values: calculatedValues.map((calc) =>
        formatValue(calc.netRevenueLux, "currency"),
      ),
    });
    allDynamicRows.push({
      label: "Payback Months (Stock OS)",
      values: calculatedValues.map((calc, index) =>
        index === BREAKEVEN_COLUMN
          ? "--"
          : calc.paybackMonthsStock === Infinity
            ? "∞"
            : Math.round(calc.paybackMonthsStock).toLocaleString("en-US"),
      ),
    });
    allDynamicRows.push({
      label: "Payback Months (Custom OS)",
      values: calculatedValues.map((calc, index) =>
        index === BREAKEVEN_COLUMN
          ? "--"
          : calc.paybackMonthsLux === Infinity
            ? "∞"
            : Math.round(calc.paybackMonthsLux).toLocaleString("en-US"),
      ),
    });
    if (showDepreciationRows) {
      const depreciation = calculatedValues.map((calc) =>
        calculateMonthlyDepreciationValues(
          calc.netRevenueStock,
          calc.netRevenueLux,
          machineCost,
        ),
      );
      allDynamicRows.push({
        label: "Monthly Machine Depreciation",
        values: depreciation.map((dep) =>
          formatValue(dep.monthlyDepreciation, "currency"),
        ),
      });
      allDynamicRows.push({
        label: "Monthly Net Profit (Stock OS)",
        values: depreciation.map((dep) =>
          formatValue(dep.netProfitStock, "currency"),
        ),
      });
      allDynamicRows.push({
        label: "Monthly Net Profit (Custom OS)",
        values: depreciation.map((dep) =>
          formatValue(dep.netProfitLux, "currency"),
        ),
      });
      allDynamicRows.push({
        label: "Annual ROI (Stock OS)",
        values: depreciation.map(
          (dep) =>
            `${formatValue(dep.roiPerYearStock, "number", { maximumFractionDigits: 0 })}%`,
        ),
      });
      allDynamicRows.push({
        label: "Annual ROI (Custom OS)",
        values: depreciation.map(
          (dep) =>
            `${formatValue(dep.roiPerYearLux, "number", { maximumFractionDigits: 0 })}%`,
        ),
      });
    }

    if (
      selectedStrategy === "STRATEGY_2" ||
      selectedStrategy === "STRATEGY_3"
    ) {
      allDynamicRows.push({
        label: "Lifetime Machine Revenue (BTC) (Stock OS)",
        values: calculatedValues.map((calc) =>
          calc.lifetimeBtcStock.toFixed(8),
        ),
      });
      allDynamicRows.push({
        label: "Lifetime Machine Revenue (BTC) (Custom OS)",
        values: calculatedValues.map((calc) => calc.lifetimeBtcLux.toFixed(8)),
      });
      allDynamicRows.push({
        label: "Lifetime Machine Revenue (Stock OS)",
        values: calculatedValues.map((calc) =>
          formatValue(calc.lifetimeRevenueStock, "currency"),
        ),
      });
      allDynamicRows.push({
        label: "Lifetime Machine Revenue (Custom OS)",
        values: calculatedValues.map((calc) =>
          formatValue(calc.lifetimeRevenueLux, "currency"),
        ),
      });
      allDynamicRows.push({
        label: "Machine Depreciation",
        values: calculatedValues.map((calc) =>
          formatValue(calc.machineDepreciation, "currency"),
        ),
      });
      allDynamicRows.push({
        label: "Lifetime Electricity & Hosting Charges",
        values: calculatedValues.map((calc) =>
          formatValue(calc.lifetimeElectricityHostingCharges, "currency"),
        ),
      });
      if (selectedStrategy === "STRATEGY_3") {
        // Price-independent: the loan funds the same bills in every scenario.
        allDynamicRows.push({
          label: `Loan Interest (${BORROWING_RATE_APR.toFixed(2)}% APR)`,
          values: Array.from({ length: columns.length }, () =>
            formatValue(loanInterest, "currency"),
          ),
        });
        allDynamicRows.push({
          label: "Loan Balance at End of Life",
          values: Array.from({ length: columns.length }, () =>
            formatValue(
              monthlyElectricityHosting * MACHINE_LIFE_YEARS * 12 +
                loanInterest,
              "currency",
            ),
          ),
        });
      }
      allDynamicRows.push({
        label: "Net Profit over Lifetime (Stock OS)",
        values: calculatedValues.map((calc, index) =>
          index === BREAKEVEN_COLUMN
            ? "--"
            : formatValue(calc.netProfitLifetimeStock, "currency"),
        ),
      });
      allDynamicRows.push({
        label: "Net Profit over Lifetime (Custom OS)",
        values: calculatedValues.map((calc, index) =>
          index === BREAKEVEN_COLUMN
            ? "--"
            : formatValue(calc.netProfitLifetimeLux, "currency"),
        ),
      });
      allDynamicRows.push({
        label: "Return Multiple (X) (Stock OS)",
        values: calculatedValues.map((calc, index) =>
          index === BREAKEVEN_COLUMN
            ? "--"
            : formatValue(calc.returnMultipleStock, "number", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
        ),
      });
      allDynamicRows.push({
        label: "Return Multiple (X) (Custom OS)",
        values: calculatedValues.map((calc, index) =>
          index === BREAKEVEN_COLUMN
            ? "--"
            : formatValue(calc.returnMultipleLux, "number", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
        ),
      });
      allDynamicRows.push({
        label: "ROI over Lifetime (Stock OS)",
        values: calculatedValues.map((calc, index) =>
          index === BREAKEVEN_COLUMN
            ? "--"
            : `${formatValue(calc.roiLifetimeStock, "number", { maximumFractionDigits: 0 })}%`,
        ),
      });
      allDynamicRows.push({
        label: "ROI over Lifetime (Custom OS)",
        values: calculatedValues.map((calc, index) =>
          index === BREAKEVEN_COLUMN
            ? "--"
            : `${formatValue(calc.roiLifetimeLux, "number", { maximumFractionDigits: 0 })}%`,
        ),
      });
      allDynamicRows.push({
        label: "ROI/Year (Stock OS)",
        values: calculatedValues.map((calc, index) =>
          index === BREAKEVEN_COLUMN
            ? "--"
            : `${formatValue(calc.roiPerYearStock, "number", { maximumFractionDigits: 0 })}%`,
        ),
      });
      allDynamicRows.push({
        label: "ROI/Year (Custom OS)",
        values: calculatedValues.map((calc, index) =>
          index === BREAKEVEN_COLUMN
            ? "--"
            : `${formatValue(calc.roiPerYearLux, "number", { maximumFractionDigits: 0 })}%`,
        ),
      });
    }
  }

  const cleanLabel = (label: string) =>
    label
      .replace(/\s*\(Stock OS\)/gi, "")
      .replace(/\s*\(Custom OS\)/gi, "")
      .replace(/\s*\(Lux OS\)/gi, "");

  // Filter rows based on selected OS
  const staticRows = allStaticRows
    .filter((row) => {
      if (selectedOS === "STOCK" && row.label.includes("Stock OS")) return true;
      if (selectedOS === "CUSTOM" && row.label.includes("Custom OS"))
        return true;
      return false;
    })
    .map((row) => ({
      ...row,
      label: cleanLabel(row.label),
    }));

  const dynamicRows = allDynamicRows
    .filter((row) => {
      if (
        row.label === "Electricity & Hosting Charges" ||
        row.label === "Machine Depreciation" ||
        row.label === "Monthly Machine Depreciation" ||
        row.label === "Lifetime Electricity & Hosting Charges" ||
        row.label.startsWith("Loan ")
      )
        return true;
      if (selectedOS === "STOCK" && row.label.includes("Stock OS")) return true;
      if (selectedOS === "CUSTOM" && row.label.includes("Custom OS"))
        return true;
      return false;
    })
    .map((row) => ({
      ...row,
      label: cleanLabel(row.label),
    }));

  const tableRows = [btcPriceRow, rewardRow, ...staticRows, ...dynamicRows];

  const alertSx = (tone: "success" | "error") => ({
    mb: 2,
    borderRadius: "8px",
    bgcolor: tone === "success" ? d.mint : d.dangerSoft,
    color: tone === "success" ? d.success : d.danger,
    fontFamily: fonts.body,
    "& .MuiAlert-icon": { color: tone === "success" ? d.success : d.danger },
  });

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "8px",
      fontFamily: fonts.body,
      "& fieldset": { borderColor: d.inputBorder },
      "&:hover fieldset": { borderColor: d.action },
    },
    "& .MuiOutlinedInput-root.Mui-focused fieldset": {
      borderColor: d.action,
      borderWidth: "2px",
    },
    "& .MuiInputLabel-root": { fontFamily: fonts.body },
  };

  const primaryBtnSx = {
    textTransform: "none",
    fontFamily: fonts.body,
    fontWeight: 650,
    borderRadius: "8px",
    minHeight: 40,
    bgcolor: d.action,
    color: "#fff",
    boxShadow: "none",
    "&:hover": { bgcolor: d.actionHover, boxShadow: "none" },
    "&.Mui-disabled": { bgcolor: d.border, color: d.muted },
  } as const;

  const outlineBtnSx = {
    textTransform: "none",
    fontFamily: fonts.body,
    fontWeight: 600,
    borderRadius: "8px",
    minHeight: 40,
    color: d.text,
    borderColor: d.inputBorder,
    "&:hover": { bgcolor: d.hover, borderColor: d.action },
  } as const;

  // The admin layout has no Daylight canvas, so the page paints its own.
  const canvasSx = {
    minHeight: "100%",
    bgcolor: d.canvas,
    p: { xs: "16px", sm: "24px", md: "28px 32px" },
  };

  // Show loading state
  if (configLoading) {
    return (
      <Box sx={canvasSx}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "400px",
          }}
        >
          <CircularProgress sx={{ color: d.action }} />
        </Box>
      </Box>
    );
  }

  // Show error state
  if (configError || !config) {
    return (
      <Box sx={canvasSx}>
        <Alert severity="error" sx={alertSx("error")}>
          {configError || "Failed to load configuration"}
        </Alert>
        <Button onClick={fetchConfig} sx={primaryBtnSx}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={canvasSx}>
      <Box
        sx={{
          maxWidth: 1600,
          mx: "auto",
          fontFamily: fonts.body,
          color: d.text,
        }}
      >
        {/* Success/Error messages for cost update */}
        {costsUpdateSuccess && (
          <Alert
            severity="success"
            sx={alertSx("success")}
            onClose={() => setCostsUpdateSuccess(null)}
          >
            {costsUpdateSuccess}
          </Alert>
        )}
        {costsUpdateError && (
          <Alert
            severity="error"
            sx={alertSx("error")}
            onClose={() => setCostsUpdateError(null)}
          >
            {costsUpdateError}
          </Alert>
        )}

        <Box sx={{ mb: { xs: "18px", md: "22px" } }}>
          {/* Title + view switcher */}
          <Box
            sx={{
              display: "flex",
              alignItems: { xs: "flex-start", sm: "center" },
              flexDirection: { xs: "column", sm: "row" },
              justifyContent: "space-between",
              gap: "14px",
              mb: "16px",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Typography
                component="h1"
                sx={{
                  fontFamily: fonts.heading,
                  fontWeight: 750,
                  fontSize: { xs: 27, md: 32 },
                  letterSpacing: "-.035em",
                  color: d.text,
                }}
              >
                Company Payback Analysis
              </Typography>
              <Box
                sx={{
                  px: "10px",
                  py: "4px",
                  borderRadius: "999px",
                  bgcolor: d.skySoft,
                  color: d.action,
                  fontSize: 11,
                  fontWeight: 650,
                  whiteSpace: "nowrap",
                }}
              >
                Self-Mining
              </Box>
            </Box>

            <Segmented
              value={viewMode}
              onChange={setViewMode}
              ariaLabel="Analysis view"
              options={VIEW_OPTIONS}
            />
          </Box>

          {/* Strategy tabs */}
          <Box sx={{ mb: "14px" }}>
            <Segmented
              value={selectedStrategy}
              onChange={setSelectedStrategy}
              ariaLabel="Strategy selector"
              options={STRATEGY_OPTIONS}
            />
          </Box>

          <Box
            sx={{
              borderLeft: `3px solid ${d.action}`,
              bgcolor: d.skySoft,
              borderRadius: "8px",
              px: "16px",
              py: "12px",
              mb: "16px",
            }}
          >
            <Typography sx={{ fontWeight: 650, fontSize: 14, color: d.text }}>
              {STRATEGY_COPY[selectedStrategy].headline}
            </Typography>
            <Typography
              sx={{ color: d.muted, maxWidth: "72ch", mt: "2px", fontSize: 12 }}
            >
              {STRATEGY_COPY[selectedStrategy].detail}
            </Typography>
          </Box>

          {/* Controls row: everything that drives the model, plus its actions */}
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <Segmented
              value={selectedMiner}
              onChange={setSelectedMiner}
              ariaLabel="Miner model selector"
              options={MINER_OPTIONS}
            />

            <Segmented
              value={selectedOS}
              onChange={setSelectedOS}
              ariaLabel="OS selector"
              options={OS_OPTIONS}
            />

            <TextField
              label={`${MINER_LABELS[selectedMiner]} Machine Cost`}
              type="number"
              value={editableActiveMachineCost}
              onChange={(e) => setEditableActiveMachineCost(e.target.value)}
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">$</InputAdornment>
                ),
              }}
              inputProps={{ step: "0.01", min: "0" }}
              sx={{ width: { xs: "100%", sm: "200px" }, ...inputSx }}
            />

            <TextField
              label={`${MINER_LABELS[selectedMiner]} Operating Cost (Monthly)`}
              type="number"
              value={editableActiveOperatingCost}
              onChange={(e) => setEditableActiveOperatingCost(e.target.value)}
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">$</InputAdornment>
                ),
              }}
              inputProps={{ step: "0.01", min: "0" }}
              sx={{ width: { xs: "100%", sm: "240px" }, ...inputSx }}
            />

            <Box
              sx={{
                display: "flex",
                gap: "10px",
                width: { xs: "100%", sm: "auto" },
              }}
            >
              <Button
                onClick={handleSaveCosts}
                disabled={isSavingCosts}
                fullWidth={isMobile}
                sx={primaryBtnSx}
              >
                {isSavingCosts ? "Saving..." : "Save Costs"}
              </Button>

              <Button
                onClick={handleRefresh}
                disabled={isRefreshing}
                fullWidth={isMobile}
                sx={outlineBtnSx}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </Box>
          </Box>

          <Typography sx={{ mt: "10px", fontSize: 11, color: d.muted }}>
            Updated:{" "}
            {lastUpdated
              ? lastUpdated.toLocaleString(undefined, {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </Typography>
        </Box>

        {/* Config summary card — the spec both views are built on */}
        <Box
          sx={{
            p: { xs: "16px", sm: "20px 24px" },
            mb: { xs: "18px", md: "22px" },
            bgcolor: d.surface,
            border: `1px solid ${d.border}`,
            borderRadius: RADIUS_CARD,
            boxShadow: d.shadow,
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr" },
              gap: "16px",
            }}
          >
            <Fact
              label="Document"
              value="Company Payback Analysis (Self-Mining)"
            />
            <Fact
              label="Hosting Charges"
              value={formatValue(activeHostingCharges, "currency", {
                minimumFractionDigits: 5,
                maximumFractionDigits: 5,
              })}
            />
            <Fact
              label="Operating Cost (Monthly)"
              value={formatValue(monthlyElectricityHosting, "currency")}
            />
            <Fact
              label="Power Consumption"
              value={`${formatValue(activePowerConsumption, "number", {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })} KWH`}
            />
            <Fact
              label={`${MINER_LABELS[selectedMiner]} Machine Cost`}
              value={formatValue(machineCost, "currency")}
            />
            <Fact label="Current Miner" value={MINER_LABELS[selectedMiner]} />
            <Fact label="Current OS" value={OS_LABELS[selectedOS]} />
            <Fact
              label={`${MINER_LABELS[selectedMiner]} Hashrate`}
              value={activeHashrateSummary}
            />
            {(selectedStrategy === "STRATEGY_2" ||
              selectedStrategy === "STRATEGY_3") && (
              <Fact
                label="Machine Life"
                value={`${MACHINE_LIFE_YEARS} Years`}
              />
            )}
            {selectedStrategy === "STRATEGY_3" && (
              <Fact
                label="USDT/(BTC Collateral) Borrowing Rate"
                value={`${BORROWING_RATE_APR.toFixed(2)}%`}
              />
            )}
          </Box>
        </Box>

        {viewMode === "GRAPHS" && (
          <PaybackGraphicalView
            miner={selectedMiner}
            os={selectedOS}
            strategy={selectedStrategy}
            reward={resolvedRewardBtcPerPhDay}
            liveBtcPrice={resolvedBtcPriceValue}
            breakevenPrice={selectedBreakevenPrice}
            loanInterest={selectedStrategy === "STRATEGY_3" ? loanInterest : 0}
            minerSpec={minerSpec}
            calculateAtPrice={calculateAtPrice}
            capitalLabel="machine cost"
            purchaseLabel="Machine cost"
            historyChart={
              /* Same Buy BTC vs Mine BTC history as the scenario table view. */
              <PaybackHistoryChart
                daylight
                profile="COMPANY"
                miner={selectedMiner}
                os={selectedOS}
                depreciation={chartDepreciation}
              />
            }
          />
        )}

        {viewMode === "TABLE" && (
          <>
            <PaybackHistoryChart
              daylight
              profile="COMPANY"
              miner={selectedMiner}
              os={selectedOS}
              depreciation={chartDepreciation}
            />

            {/* Data table — horizontally scrollable on mobile */}
            <Box
              sx={{
                bgcolor: d.surface,
                border: `1px solid ${d.border}`,
                borderRadius: RADIUS_CARD,
                boxShadow: d.shadow,
                overflow: "hidden",
              }}
            >
              {supportsDepreciation && (
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: "10px",
                    px: { xs: "12px", sm: "16px" },
                    py: "10px",
                    borderBottom: `1px solid ${d.border}`,
                  }}
                >
                  <ToggleChip
                    checked={includeDepreciation}
                    onChange={setIncludeDepreciation}
                    label="Include Machine Depreciation"
                  />
                </Box>
              )}
              <TableContainer
                sx={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
              >
                <Table size="small" sx={{ minWidth: 1160 }}>
                  <TableHead sx={{ backgroundColor: d.tableHead }}>
                    <TableRow>
                      <TableCell
                        sx={{
                          fontFamily: fonts.body,
                          fontWeight: 600,
                          fontSize: 10,
                          letterSpacing: ".015em",
                          textTransform: "uppercase",
                          color: d.muted,
                          borderBottomColor: d.border,
                          minWidth: { xs: 130, sm: 200 },
                          px: { xs: 1, sm: 1.5 },
                          py: { xs: "9px", sm: "11px" },
                          whiteSpace: "nowrap",
                        }}
                      >
                        Metric
                      </TableCell>
                      {columns.map((column, index) => (
                        <TableCell
                          key={column}
                          sx={{
                            fontFamily: fonts.body,
                            fontWeight: 600,
                            fontSize: { xs: 9, sm: 10 },
                            letterSpacing: ".01em",
                            textTransform: "uppercase",
                            color: d.muted,
                            lineHeight: 1.25,
                            px: { xs: 0.75, sm: 1.25 },
                            py: { xs: "9px", sm: "11px" },
                            borderLeft: `1px solid ${d.border}`,
                            borderBottomColor: d.border,
                            whiteSpace: "pre-line",
                            ...baseCaseCellSx(index),
                            ...(baseCaseByColumn.has(index) && {
                              color: baseCaseTone(
                                baseCaseByColumn.get(index)!.year,
                              ).strong,
                              borderTop: `2px solid ${
                                baseCaseTone(baseCaseByColumn.get(index)!.year)
                                  .strong
                              }`,
                            }),
                          }}
                          align="right"
                        >
                          {column}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableRows.map((row) => (
                      <TableRow
                        key={row.label}
                        hover
                        sx={{
                          "&:hover": { backgroundColor: d.hover },
                          "& .MuiTableCell-root": {
                            borderBottomColor: d.border,
                            fontFamily: fonts.body,
                          },
                        }}
                      >
                        <TableCell
                          sx={{
                            fontWeight: 600,
                            fontSize: { xs: "0.7rem", sm: "0.8rem" },
                            color: d.text,
                            whiteSpace: "nowrap",
                            px: { xs: 1, sm: 1.5 },
                            py: { xs: "9px", sm: "11px" },
                          }}
                        >
                          {row.label}
                        </TableCell>
                        {row.values.map((value, index) => (
                          <TableCell
                            key={`${row.label}-${index}`}
                            align="right"
                            sx={{
                              fontWeight: 400,
                              fontSize: { xs: "0.65rem", sm: "0.8rem" },
                              color: d.text,
                              whiteSpace: "nowrap",
                              px: { xs: 0.5, sm: 1 },
                              py: { xs: "9px", sm: "11px" },
                              borderLeft: `1px solid ${d.border}`,
                              ...(row.label === "BTC Price (USD)" && index === 0
                                ? { backgroundColor: d.amber }
                                : {}),
                              ...(row.label === "BTC Price (USD)" &&
                              index === BREAKEVEN_COLUMN &&
                              selectedOS === "CUSTOM"
                                ? { backgroundColor: d.mint } // Custom OS
                                : {}),
                              ...(row.label === "BTC Price (USD)" &&
                              index === BREAKEVEN_COLUMN &&
                              selectedOS === "STOCK"
                                ? { backgroundColor: d.skySoft } // Stock OS
                                : {}),
                              ...(row.label === "BTC Price (USD)" &&
                              index === DEPRECIATION_BREAKEVEN_COLUMN
                                ? { backgroundColor: d.dangerSoft } // chart's depreciation line
                                : {}),
                              ...baseCaseCellSx(index),
                            }}
                          >
                            {value}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {showBaseCase && (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    px: { xs: "14px", sm: "16px" },
                    py: "10px",
                    borderTop: `1px solid ${d.border}`,
                    bgcolor: d.tableHead,
                    fontFamily: fonts.body,
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  {baseCases.map((baseCase) => {
                    const tone = baseCaseTone(baseCase.year);
                    return (
                      <Box
                        key={baseCase.year}
                        sx={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                        }}
                      >
                        <Box
                          aria-hidden
                          sx={{
                            flexShrink: 0,
                            width: 12,
                            height: 12,
                            mt: "3px",
                            borderRadius: "3px",
                            bgcolor: tone.soft,
                            border: `2px solid ${tone.strong}`,
                          }}
                        />
                        <Typography
                          component="span"
                          sx={{
                            fontFamily: "inherit",
                            fontSize: "inherit",
                            color: d.muted,
                          }}
                        >
                          <Box
                            component="span"
                            sx={{ fontWeight: 650, color: tone.strong }}
                          >
                            {baseCase.label}{" "}
                            {formatWholeUsd(baseCase.scenarioPrice)}:
                          </Box>{" "}
                          {baseCase.description}
                        </Typography>
                      </Box>
                    );
                  })}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                      color: d.muted,
                    }}
                  >
                    <InfoOutlinedIcon
                      aria-hidden
                      sx={{ fontSize: 14, flexShrink: 0, mt: "2px" }}
                    />
                    <Typography
                      component="span"
                      sx={{ fontFamily: "inherit", fontSize: "inherit" }}
                    >
                      {LIFETIME_BTC_NOTE}
                    </Typography>
                  </Box>
                </Box>
              )}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
