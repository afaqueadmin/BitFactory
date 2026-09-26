"use client";

/**
 * Payback Analysis page - BitFactory Daylight theme (v1.3)
 *
 * The default "Scenario Table" view is fully re-themed (heading, view/strategy
 * switchers, controls, config summary, data table). The "Graphical Analysis"
 * alternate view (PaybackGraphicalView and its chart primitives, shared with
 * the admin payback-analysis-company page) keeps its current MUI-theme-based
 * look for now - see the PR/commit notes for scope.
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
import { useCallback, useEffect, useState } from "react";
import { formatValue } from "@/lib/helpers/formatValue";
import PaybackHistoryChart from "@/components/PaybackHistoryChart";
import PaybackGraphicalView, {
  PaybackMinerSpec,
} from "@/components/payback/PaybackGraphicalView";
import { PaybackAccountType } from "@/lib/helpers/paybackAccountType";
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
  calculateStrategy2Values,
  calculateStrategy3Values,
} from "@/lib/helpers/paybackCalculations";
import Segmented, { SegmentedOption } from "@/components/daylight/Segmented";
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
  { id: "STRATEGY_1", label: "Strategy 1" },
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

const columns = [
  "CURRENT",
  "Scenario: 1",
  "Scenario: 2",
  "Scenario: 3",
  "Scenario: 4",
  "Scenario: 5",
  "Scenario: 6",
  "Scenario: 7",
  "BREAKEVEN\n(Hosting Charges)",
];

// Data Sources:
// - BTC Price: CoinGecko API (live market price)
// - Hashprice: Live pool-wide Luxor API (/api/pool-hashprice-live - real-time summary)
// Note: Using live pool-wide hashprice ensures CLIENT and ADMIN see identical values
// Note: Same live endpoint as hashprice history page for consistency

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
  invoicedAmount: number;
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

export default function PaybackAnalysisPage() {
  const { d, fonts } = useDaylight();
  const isMobile = useMediaQuery("(max-width:599.95px)");

  // Config state
  const [config, setConfig] = useState<PaybackConfigData | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  // User role and invoiced amount state
  const [userRole, setUserRole] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<PaybackAccountType>("CLIENT");
  const [editableInvoicedAmount, setEditableInvoicedAmount] =
    useState<string>("4250");
  const [isUpdatingInvoiced, setIsUpdatingInvoiced] = useState(false);
  const [invoicedUpdateSuccess, setInvoicedUpdateSuccess] = useState<
    string | null
  >(null);
  const [invoicedUpdateError, setInvoicedUpdateError] = useState<string | null>(
    null,
  );

  // Self-mining accounts have no invoice to stand in for capital, so they
  // enter the machine cost directly — one value per miner model, mirroring
  // how the company config stores it.
  const [editableS21ProMachineCost, setEditableS21ProMachineCost] =
    useState<string>("");
  const [editableS21XpMachineCost, setEditableS21XpMachineCost] =
    useState<string>("");
  const [isSavingMachineCost, setIsSavingMachineCost] = useState(false);
  const [machineCostSuccess, setMachineCostSuccess] = useState<string | null>(
    null,
  );
  const [machineCostError, setMachineCostError] = useState<string | null>(null);

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
    useState<PaybackStrategy>("STRATEGY_1");

  // OS selector state
  const [selectedOS, setSelectedOS] = useState<OsSelection>("STOCK");

  // Miner selector state
  const [selectedMiner, setSelectedMiner] = useState<MinerModel>("S21PRO");

  // Which half of the analysis is on screen: the scenario grid, or the charts.
  const [viewMode, setViewMode] = useState<ViewMode>("TABLE");

  // Calculated values for all scenarios
  const [calculatedValues, setCalculatedValues] = useState<Strategy2Values[]>(
    [],
  );

  // Fetch config from API
  const fetchConfig = useCallback(async () => {
    try {
      setConfigLoading(true);
      setConfigError(null);
      const response = await fetch("/api/payback-config");
      if (!response.ok) {
        throw new Error("Failed to fetch configuration");
      }
      const data = await response.json();
      if (data.success && data.data) {
        setConfig(data.data);
        setUserRole(data.userRole || null);
        setAccountType(
          data.accountType === "SELF_MINING" ? "SELF_MINING" : "CLIENT",
        );

        setEditableS21ProMachineCost(String(data.data.s21proMachineCost));
        setEditableS21XpMachineCost(String(data.data.s21xpMachineCost));

        // Set editable invoiced amount based on user role
        if (data.userRole === "ADMIN" || data.userRole === "SUPER_ADMIN") {
          // Admin/Super Admin default: 4250 (session-only, not persisted)
          setEditableInvoicedAmount("4250");
        } else {
          // Client: use value from database
          setEditableInvoicedAmount(String(data.data.invoicedAmount || "4250"));
        }
      } else {
        throw new Error(data.error || "Invalid configuration data");
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Failed to load configuration";
      setConfigError(errorMsg);
      console.error("[Payback Analysis] Config fetch error:", error);
    } finally {
      setConfigLoading(false);
    }
  }, []);

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
      console.warn("[Payback Analysis] Failed to fetch live BTC price:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const fetchLuxorReward = useCallback(async () => {
    try {
      // Use live pool-wide hashprice API to get real-time value for all users
      // Same endpoint as hashprice history page for consistency
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

      // Get the live pool-wide hashprice (today's real-time value)
      if (!data.success || !data.data || !Number.isFinite(data.data.hashprice))
        return;

      const rewardBtcPerPhDay = data.data.hashprice;

      setLiveRewardBtcPerPhDay(rewardBtcPerPhDay);
    } catch {
      // ignore and keep fallback
    }
  }, []);

  // Handle invoiced amount update
  const handleUpdateInvoicedAmount = useCallback(async () => {
    try {
      setIsUpdatingInvoiced(true);
      setInvoicedUpdateError(null);
      setInvoicedUpdateSuccess(null);

      const numValue = parseFloat(editableInvoicedAmount);
      if (isNaN(numValue) || numValue < 0) {
        setInvoicedUpdateError("Please enter a valid amount");
        return;
      }

      // For ADMIN/SUPER_ADMIN: just use the value temporarily (no API call)
      if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
        setInvoicedUpdateSuccess("Invoiced amount updated for this session");
        setTimeout(() => setInvoicedUpdateSuccess(null), 3000);
        return;
      }

      // For CLIENT: save to database
      const response = await fetch("/api/user/invoiced-amount", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invoicedAmount: numValue }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update invoiced amount");
      }

      if (data.success) {
        setInvoicedUpdateSuccess("Invoiced amount saved successfully!");
        // Update the config with new value
        if (config) {
          setConfig({
            ...config,
            invoicedAmount: numValue,
          });
        }
        setTimeout(() => setInvoicedUpdateSuccess(null), 3000);
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : "Failed to update invoiced amount";
      setInvoicedUpdateError(errorMsg);
    } finally {
      setIsUpdatingInvoiced(false);
    }
  }, [editableInvoicedAmount, userRole, config]);

  // Saves the machine cost of whichever miner model is selected. Self-mining
  // accounts read the COMPANY config, so this writes that same record — the
  // admin company page picks the value up too.
  const handleSaveMachineCost = useCallback(async () => {
    const numValue = parseFloat(
      selectedMiner === "S21XP"
        ? editableS21XpMachineCost
        : editableS21ProMachineCost,
    );

    if (!Number.isFinite(numValue) || numValue < 0) {
      setMachineCostError("Please enter a valid machine cost");
      return;
    }

    try {
      setIsSavingMachineCost(true);
      setMachineCostError(null);
      setMachineCostSuccess(null);

      const response = await fetch("/api/payback-config/machine-cost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ miner: selectedMiner, machineCost: numValue }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save machine cost");
      }

      // The endpoint returns the company config, which carries no invoiced
      // amount — keep the page's own.
      setConfig((prev) =>
        prev
          ? { ...prev, ...data.data, invoicedAmount: prev.invoicedAmount }
          : prev,
      );
      setMachineCostSuccess("Machine cost saved successfully!");
      setTimeout(() => setMachineCostSuccess(null), 3000);
    } catch (error) {
      setMachineCostError(
        error instanceof Error ? error.message : "Failed to save machine cost",
      );
    } finally {
      setIsSavingMachineCost(false);
    }
  }, [selectedMiner, editableS21ProMachineCost, editableS21XpMachineCost]);

  const resolvedBtcPriceValue = liveBtcPriceValue ?? FALLBACK_BTC_PRICE;
  const resolvedRewardBtcPerPhDay =
    liveRewardBtcPerPhDay ?? FALLBACK_REWARD_BTC_PER_PH_DAY;

  const isSelfMining = accountType === "SELF_MINING";

  // The machine cost input tracks whichever miner model tab is active
  const editableActiveMachineCost =
    selectedMiner === "S21XP"
      ? editableS21XpMachineCost
      : editableS21ProMachineCost;
  const setEditableActiveMachineCost =
    selectedMiner === "S21XP"
      ? setEditableS21XpMachineCost
      : setEditableS21ProMachineCost;

  // Everything the model needs about one miner model. Resolving both models
  // through one function lets the graphical view chart either of them without
  // the page having to duplicate the lookups.
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
      const hosting = isXp
        ? config.s21xpMonthlyInvoicingAmount
        : config.s21proMonthlyInvoicingAmount;
      // Self-mining accounts have no client invoice to offset — use the
      // machine cost for that model instead. The typed-in value drives the
      // analysis straight away; the stored one stands in while the field is
      // empty or mid-edit.
      const enteredMachineCost = parseFloat(
        isXp ? editableS21XpMachineCost : editableS21ProMachineCost,
      );
      const storedMachineCost = isXp
        ? config.s21xpMachineCost
        : config.s21proMachineCost;
      const purchase = isSelfMining
        ? Number.isFinite(enteredMachineCost) && enteredMachineCost >= 0
          ? enteredMachineCost
          : storedMachineCost
        : parseFloat(editableInvoicedAmount || "0");

      return {
        hosting,
        capital: isSelfMining ? purchase : purchase - hosting,
        purchase,
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
      isSelfMining,
      editableInvoicedAmount,
      editableS21ProMachineCost,
      editableS21XpMachineCost,
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

  // Recalculate values when BTC price, reward, or config changes
  useEffect(() => {
    // Index 0 is CURRENT (live BTC price), then one column per scenario price:
    // the fixed steps, then the calculated breakeven.
    const prices = [
      resolvedBtcPriceValue,
      ...FIXED_SCENARIO_PRICES,
      selectedBreakevenPrice,
    ];

    setCalculatedValues(
      prices
        .map((price) => calculateAtPrice(selectedMiner, price))
        .filter((values): values is Strategy2Values => values !== null),
    );
  }, [
    calculateAtPrice,
    selectedMiner,
    resolvedBtcPriceValue,
    selectedBreakevenPrice,
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
      "$100,000",
      "$125,000",
      "$150,000",
      "$200,000",
      "$250,000",
      "$300,000",
      "$350,000",
      formatValue(selectedBreakevenPrice, "currency"),
    ],
  };

  const rewardRow = {
    label: "Reward (BTC/PH/Day)",
    values: Array.from({ length: 9 }, () =>
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
            { length: 9 },
            () => `${config.poolCommissionStockOs.toFixed(2)}%`,
          ),
        },
        {
          label: "Pool Commission (Custom OS)",
          values: Array.from(
            { length: 9 },
            () => `${config.poolCommissionLuxos.toFixed(2)}%`,
          ),
        },
        {
          label: `${MINER_LABELS[selectedMiner]} Hashrate (TH) (Stock OS)`,
          values: Array.from({ length: 9 }, () =>
            formatValue(activeHashrateStockOs, "number", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
          ),
        },
        {
          label: `${MINER_LABELS[selectedMiner]} Hashrate (TH) (Custom OS)`,
          values: Array.from({ length: 9 }, () =>
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
      values: Array.from({ length: 9 }, () =>
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
        index === 8 // BREAKEVEN column
          ? "--"
          : calc.paybackMonthsStock === Infinity
            ? "∞"
            : Math.round(calc.paybackMonthsStock).toLocaleString("en-US"),
      ),
    });
    allDynamicRows.push({
      label: "Payback Months (Custom OS)",
      values: calculatedValues.map((calc, index) =>
        index === 8 // BREAKEVEN column
          ? "--"
          : calc.paybackMonthsLux === Infinity
            ? "∞"
            : Math.round(calc.paybackMonthsLux).toLocaleString("en-US"),
      ),
    });

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
          values: Array.from({ length: 9 }, () =>
            formatValue(loanInterest, "currency"),
          ),
        });
        allDynamicRows.push({
          label: "Loan Balance at End of Life",
          values: Array.from({ length: 9 }, () =>
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
          index === 8
            ? "--"
            : formatValue(calc.netProfitLifetimeStock, "currency"),
        ),
      });
      allDynamicRows.push({
        label: "Net Profit over Lifetime (Custom OS)",
        values: calculatedValues.map((calc, index) =>
          index === 8
            ? "--"
            : formatValue(calc.netProfitLifetimeLux, "currency"),
        ),
      });
      allDynamicRows.push({
        label: "Return Multiple (X) (Stock OS)",
        values: calculatedValues.map((calc, index) =>
          index === 8
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
          index === 8
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
          index === 8
            ? "--"
            : `${formatValue(calc.roiLifetimeStock, "number", { maximumFractionDigits: 0 })}%`,
        ),
      });
      allDynamicRows.push({
        label: "ROI over Lifetime (Custom OS)",
        values: calculatedValues.map((calc, index) =>
          index === 8
            ? "--"
            : `${formatValue(calc.roiLifetimeLux, "number", { maximumFractionDigits: 0 })}%`,
        ),
      });
      allDynamicRows.push({
        label: "ROI/Year (Stock OS)",
        values: calculatedValues.map((calc, index) =>
          index === 8
            ? "--"
            : `${formatValue(calc.roiPerYearStock, "number", { maximumFractionDigits: 0 })}%`,
        ),
      });
      allDynamicRows.push({
        label: "ROI/Year (Custom OS)",
        values: calculatedValues.map((calc, index) =>
          index === 8
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

  // Show loading state
  if (configLoading) {
    return (
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
    );
  }

  // Show error state
  if (configError || !config) {
    return (
      <Box>
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
    <Box
      sx={{ maxWidth: 1600, mx: "auto", fontFamily: fonts.body, color: d.text }}
    >
      {/* Success/Error messages for invoiced amount update */}
      {invoicedUpdateSuccess && (
        <Alert
          severity="success"
          sx={alertSx("success")}
          onClose={() => setInvoicedUpdateSuccess(null)}
        >
          {invoicedUpdateSuccess}
        </Alert>
      )}
      {invoicedUpdateError && (
        <Alert
          severity="error"
          sx={alertSx("error")}
          onClose={() => setInvoicedUpdateError(null)}
        >
          {invoicedUpdateError}
        </Alert>
      )}

      {/* Success/Error messages for the self-mining machine cost */}
      {machineCostSuccess && (
        <Alert
          severity="success"
          sx={alertSx("success")}
          onClose={() => setMachineCostSuccess(null)}
        >
          {machineCostSuccess}
        </Alert>
      )}
      {machineCostError && (
        <Alert
          severity="error"
          sx={alertSx("error")}
          onClose={() => setMachineCostError(null)}
        >
          {machineCostError}
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
              Payback Analysis
            </Typography>
            {isSelfMining && (
              <Box
                sx={{
                  px: "10px",
                  py: "4px",
                  borderRadius: "999px",
                  bgcolor: d.skySoft,
                  color: d.action,
                  fontSize: 11,
                  fontWeight: 650,
                }}
              >
                Self-Mining Account
              </Box>
            )}
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

          {!isSelfMining && (
            <TextField
              label="Invoiced Amount"
              type="number"
              value={editableInvoicedAmount}
              onChange={(e) => setEditableInvoicedAmount(e.target.value)}
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">$</InputAdornment>
                ),
              }}
              inputProps={{ step: "0.01", min: "0" }}
              sx={{ width: { xs: "100%", sm: "180px" }, ...inputSx }}
            />
          )}

          {isSelfMining && (
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
          )}

          <Box
            sx={{
              display: "flex",
              gap: "10px",
              width: { xs: "100%", sm: "auto" },
            }}
          >
            {!isSelfMining && (
              <Button
                onClick={handleUpdateInvoicedAmount}
                disabled={isUpdatingInvoiced}
                fullWidth={isMobile}
                sx={primaryBtnSx}
              >
                {isUpdatingInvoiced ? "Updating..." : "Update"}
              </Button>
            )}

            {isSelfMining && (
              <Button
                onClick={handleSaveMachineCost}
                disabled={isSavingMachineCost}
                fullWidth={isMobile}
                sx={primaryBtnSx}
              >
                {isSavingMachineCost ? "Saving..." : "Save Machine Cost"}
              </Button>
            )}

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
          <Fact label="Document" value="Payback Analysis" />
          <Fact
            label="Hosting Charges"
            value={formatValue(activeHostingCharges, "currency", {
              minimumFractionDigits: 5,
              maximumFractionDigits: 5,
            })}
          />
          <Fact
            label={
              isSelfMining ? "Monthly Operating Cost" : "Monthly Invoicing"
            }
            value={formatValue(monthlyElectricityHosting, "currency")}
          />
          <Fact
            label="Power Consumption"
            value={`${formatValue(activePowerConsumption, "number", {
              minimumFractionDigits: 4,
              maximumFractionDigits: 4,
            })} KWH`}
          />
          {!isSelfMining && (
            <Fact
              label="Invoiced Amount"
              value={formatValue(
                parseFloat(editableInvoicedAmount || "0"),
                "currency",
              )}
            />
          )}
          <Fact
            label="Machine Cost"
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
            <Fact label="Machine Life" value={`${MACHINE_LIFE_YEARS} Years`} />
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
          purchaseLabel={isSelfMining ? "Machine cost" : "You pay once"}
          historyChart={
            /* Same Buy BTC vs Mine BTC history as the scenario table view. */
            <PaybackHistoryChart
              daylight
              profile="CLIENT"
              miner={selectedMiner}
              os={selectedOS}
            />
          }
        />
      )}

      {viewMode === "TABLE" && (
        <>
          <PaybackHistoryChart
            daylight
            profile="CLIENT"
            miner={selectedMiner}
            os={selectedOS}
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
            <TableContainer
              sx={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
            >
              <Table size="small" sx={{ minWidth: 920 }}>
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
                        whiteSpace: "nowrap",
                      }}
                    >
                      Metric
                    </TableCell>
                    {columns.map((column) => (
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
                          borderLeft: `1px solid ${d.border}`,
                          borderBottomColor: d.border,
                          whiteSpace: "pre-line",
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
                            borderLeft: `1px solid ${d.border}`,
                            ...(row.label === "BTC Price (USD)" && index === 0
                              ? { backgroundColor: d.amber }
                              : {}),
                            ...(row.label === "BTC Price (USD)" &&
                            index === 8 &&
                            selectedOS === "CUSTOM"
                              ? { backgroundColor: d.mint } // Custom OS
                              : {}),
                            ...(row.label === "BTC Price (USD)" &&
                            index === 8 &&
                            selectedOS === "STOCK"
                              ? { backgroundColor: d.skySoft } // Stock OS
                              : {}),
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
          </Box>
        </>
      )}
    </Box>
  );
}
