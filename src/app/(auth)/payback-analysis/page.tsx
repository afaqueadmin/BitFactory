"use client";

import {
  Box,
  Paper,
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
  ToggleButtonGroup,
  ToggleButton,
  Tabs,
  Tab,
  Chip,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import {
  TableChart as TableChartIcon,
  InsightsOutlined as InsightsIcon,
} from "@mui/icons-material";
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

type PaybackStrategy = PaybackStrategyKey;

const OS_LABELS: Record<"STOCK" | "CUSTOM" | "COMPARISON", string> = {
  STOCK: "Stock OS",
  CUSTOM: "Custom OS",
  COMPARISON: "Comparison (both)",
};

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

export default function PaybackAnalysisPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

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
  const [selectedOS, setSelectedOS] = useState<
    "STOCK" | "CUSTOM" | "COMPARISON"
  >("STOCK");

  // Miner selector state
  const [selectedMiner, setSelectedMiner] = useState<MinerModel>("S21PRO");

  // Which half of the analysis is on screen: the scenario grid, or the charts.
  const [viewMode, setViewMode] = useState<"TABLE" | "GRAPHS">("TABLE");

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
      const response = await fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
      );
      if (!response.ok) return;
      const data = (await response.json()) as { price: string };
      const price = Number(data.price);
      if (!Number.isFinite(price)) return;
      setLiveBtcPriceValue(price);
      setLiveBtcPrice(
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(price),
      );
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

  const resolvedBtcPriceValue = liveBtcPriceValue ?? FALLBACK_BTC_PRICE;
  const resolvedRewardBtcPerPhDay =
    liveRewardBtcPerPhDay ?? FALLBACK_REWARD_BTC_PER_PH_DAY;

  const isSelfMining = accountType === "SELF_MINING";

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
      // company's own machine cost for that model instead.
      const purchase = isSelfMining
        ? isXp
          ? config.s21xpMachineCost
          : config.s21proMachineCost
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
    [config, isSelfMining, editableInvoicedAmount],
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

  // Hashrate for whichever miner/OS the selectors are on. Comparison shows
  // both, since that view charts neither one alone.
  const formatHashrate = (th: number) =>
    `${formatValue(th, "number", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} TH/s`;
  const activeHashrateSummary =
    selectedOS === "COMPARISON"
      ? `${formatHashrate(activeHashrateStockOs)} (Stock) · ${formatHashrate(
          activeHashrateLuxos,
        )} (Custom)`
      : formatHashrate(
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

  // Filter rows based on selected OS
  const staticRows = allStaticRows.filter((row) => {
    if (selectedOS === "COMPARISON") return true;
    if (selectedOS === "STOCK" && row.label.includes("Stock OS")) return true;
    if (selectedOS === "CUSTOM" && row.label.includes("Custom OS")) return true;
    return false;
  });

  const dynamicRows = allDynamicRows.filter((row) => {
    if (selectedOS === "COMPARISON") return true;
    if (
      row.label === "Electricity & Hosting Charges" ||
      row.label === "Machine Depreciation" ||
      row.label === "Lifetime Electricity & Hosting Charges" ||
      row.label.startsWith("Loan ")
    )
      return true;
    if (selectedOS === "STOCK" && row.label.includes("Stock OS")) return true;
    if (selectedOS === "CUSTOM" && row.label.includes("Custom OS")) return true;
    return false;
  });

  const tableRows = [btcPriceRow, rewardRow, ...staticRows, ...dynamicRows];

  // Show loading state
  if (configLoading) {
    return (
      <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, mt: { xs: 1, md: 2 } }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "400px",
          }}
        >
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  // Show error state
  if (configError || !config) {
    return (
      <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, mt: { xs: 1, md: 2 } }}>
        <Alert severity="error" sx={{ mb: 3 }}>
          {configError || "Failed to load configuration"}
        </Alert>
        <Button variant="contained" onClick={fetchConfig}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, mt: { xs: 1, md: 2 } }}>
      {/* Success/Error messages for invoiced amount update */}
      {invoicedUpdateSuccess && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setInvoicedUpdateSuccess(null)}
        >
          {invoicedUpdateSuccess}
        </Alert>
      )}
      {invoicedUpdateError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setInvoicedUpdateError(null)}
        >
          {invoicedUpdateError}
        </Alert>
      )}

      <Box sx={{ mb: { xs: 2, md: 3 } }}>
        {/* Title + view switcher */}
        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "flex-start", sm: "center" },
            flexDirection: { xs: "column", sm: "row" },
            justifyContent: "space-between",
            gap: { xs: 1.5, sm: 2 },
            mb: { xs: 2, md: 3 },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                fontSize: { xs: "1.6rem", sm: "2rem", md: "2.125rem" },
              }}
            >
              Payback Analysis
            </Typography>
            {isSelfMining && (
              <Chip label="Self-Mining Account" color="primary" size="small" />
            )}
          </Box>

          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(e, newValue) => {
              if (newValue !== null) setViewMode(newValue);
            }}
            aria-label="Analysis view"
            size="small"
            sx={{
              "& .MuiToggleButton-root": {
                px: { xs: 1.5, sm: 2 },
                py: 0.75,
                fontSize: { xs: "0.75rem", sm: "0.8125rem" },
                lineHeight: 1.5,
                gap: 0.75,
              },
            }}
          >
            <ToggleButton value="TABLE" aria-label="Scenario table">
              <TableChartIcon sx={{ fontSize: "1.05rem" }} />
              {isMobile ? "Table" : "Scenario Table"}
            </ToggleButton>
            <ToggleButton value="GRAPHS" aria-label="Graphical analysis">
              <InsightsIcon sx={{ fontSize: "1.05rem" }} />
              {isMobile ? "Graphs" : "Graphical Analysis"}
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Strategy tabs */}
        <Tabs
          value={selectedStrategy}
          onChange={(e, newValue) => setSelectedStrategy(newValue)}
          aria-label="Strategy selector"
          sx={{ mb: { xs: 1.5, sm: 2 }, minHeight: 36 }}
        >
          <Tab
            value="STRATEGY_1"
            label="Strategy 1"
            sx={{ minHeight: 36, py: 0.5 }}
          />
          <Tab
            value="STRATEGY_2"
            label="Strategy 2"
            sx={{ minHeight: 36, py: 0.5 }}
          />
          <Tab
            value="STRATEGY_3"
            label="Strategy 3"
            sx={{ minHeight: 36, py: 0.5 }}
          />
        </Tabs>

        <Box
          sx={{
            borderLeft: `4px solid ${theme.palette.primary.main}`,
            backgroundColor:
              theme.palette.mode === "dark"
                ? "rgba(255,255,255,0.05)"
                : "rgba(0,0,0,0.03)",
            borderRadius: 1,
            px: { xs: 1.5, sm: 2 },
            py: { xs: 1, sm: 1.25 },
            mb: { xs: 1.5, sm: 2 },
          }}
        >
          <Typography
            sx={{
              fontWeight: 650,
              fontSize: { xs: "0.95rem", sm: "1.05rem" },
            }}
          >
            {STRATEGY_COPY[selectedStrategy].headline}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              maxWidth: "72ch",
              mt: 0.25,
              fontSize: { xs: "0.8rem", sm: "0.875rem" },
            }}
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
            gap: { xs: 1.5, sm: 2 },
            "& .MuiToggleButton-root": {
              px: { xs: 1.5, sm: 2 },
              py: 0.75,
              fontSize: { xs: "0.75rem", sm: "0.8125rem" },
              lineHeight: 1.5,
            },
          }}
        >
          <ToggleButtonGroup
            value={selectedMiner}
            exclusive
            onChange={(e, newValue) => {
              if (newValue !== null) setSelectedMiner(newValue);
            }}
            aria-label="Miner model selector"
            size="small"
          >
            <ToggleButton value="S21PRO" aria-label="S21 Pro Analysis">
              S21 Pro Analysis
            </ToggleButton>
            <ToggleButton value="S21XP" aria-label="S21 XP Analysis">
              S21 XP Analysis
            </ToggleButton>
          </ToggleButtonGroup>

          <ToggleButtonGroup
            value={selectedOS}
            exclusive
            onChange={(e, newValue) => {
              if (newValue !== null) setSelectedOS(newValue);
            }}
            aria-label="OS selector"
            size="small"
          >
            <ToggleButton value="STOCK" aria-label="Stock OS">
              {isMobile ? "Stock" : "Stock OS"}
            </ToggleButton>
            <ToggleButton value="CUSTOM" aria-label="Custom OS">
              {isMobile ? "Custom" : "Custom OS"}
            </ToggleButton>
            <ToggleButton value="COMPARISON" aria-label="COMPARISON">
              {isMobile ? "Compare" : "Comparison"}
            </ToggleButton>
          </ToggleButtonGroup>

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
              sx={{ width: { xs: "100%", sm: "180px" } }}
            />
          )}

          <Box
            sx={{
              display: "flex",
              gap: 1.5,
              width: { xs: "100%", sm: "auto" },
            }}
          >
            {!isSelfMining && (
              <Button
                variant="contained"
                onClick={handleUpdateInvoicedAmount}
                disabled={isUpdatingInvoiced}
                size="small"
                fullWidth={isMobile}
              >
                {isUpdatingInvoiced ? "Updating..." : "Update"}
              </Button>
            )}

            <Button
              variant="outlined"
              onClick={handleRefresh}
              disabled={isRefreshing}
              size="small"
              fullWidth={isMobile}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
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
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: { xs: 2, md: 3 } }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr" },
            gap: { xs: 2, sm: 2 },
          }}
        >
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Document
            </Typography>
            <Typography variant="body2">Payback Analysis</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Hosting Charges
            </Typography>
            <Typography variant="body2">
              {formatValue(activeHostingCharges, "currency", {
                minimumFractionDigits: 5,
                maximumFractionDigits: 5,
              })}
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              {isSelfMining ? "Monthly Operating Cost" : "Monthly Invoicing"}
            </Typography>
            <Typography variant="body2">
              {formatValue(monthlyElectricityHosting, "currency")}
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Power Consumption
            </Typography>
            <Typography variant="body2">
              {`${formatValue(activePowerConsumption, "number", {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })} KWH`}
            </Typography>
          </Box>
          {!isSelfMining && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Invoiced Amount
              </Typography>
              <Typography variant="body2">
                {formatValue(
                  parseFloat(editableInvoicedAmount || "0"),
                  "currency",
                )}
              </Typography>
            </Box>
          )}
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Machine Cost
            </Typography>
            <Typography variant="body2">
              {formatValue(machineCost, "currency")}
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Current Miner
            </Typography>
            <Typography variant="body2">
              {MINER_LABELS[selectedMiner]}
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Current OS
            </Typography>
            <Typography variant="body2">{OS_LABELS[selectedOS]}</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              {`${MINER_LABELS[selectedMiner]} Hashrate`}
            </Typography>
            <Typography variant="body2">{activeHashrateSummary}</Typography>
          </Box>
          {(selectedStrategy === "STRATEGY_2" ||
            selectedStrategy === "STRATEGY_3") && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Machine Life
              </Typography>
              <Typography variant="body2">{`${MACHINE_LIFE_YEARS} Years`}</Typography>
            </Box>
          )}
          {selectedStrategy === "STRATEGY_3" && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                USDT/(BTC Collateral) Borrowing Rate
              </Typography>
              <Typography variant="body2">{`${BORROWING_RATE_APR.toFixed(2)}%`}</Typography>
            </Box>
          )}
        </Box>
      </Paper>

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
        />
      )}

      {viewMode === "TABLE" && (
        <>
          <PaybackHistoryChart
            profile="CLIENT"
            miner={selectedMiner}
            os={selectedOS}
          />

          {/* Data table — horizontally scrollable on mobile */}
          <TableContainer
            component={Paper}
            sx={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
          >
            <Table size="small" sx={{ minWidth: 920 }}>
              <TableHead
                sx={{
                  backgroundColor:
                    theme.palette.mode === "dark"
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(0,0,0,0.03)",
                }}
              >
                <TableRow>
                  <TableCell
                    sx={{
                      fontWeight: 700,
                      minWidth: { xs: 140, sm: 220 },
                      fontSize: { xs: "0.7rem", sm: "0.8rem" },
                      px: { xs: 0.75, sm: 1.25 },
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      backgroundColor:
                        theme.palette.mode === "dark"
                          ? theme.palette.grey[900]
                          : theme.palette.background.paper,
                    }}
                  >
                    Metric
                  </TableCell>
                  {columns.map((column) => (
                    <TableCell
                      key={column}
                      sx={{
                        fontWeight: 700,
                        fontSize: { xs: "0.6rem", sm: "0.75rem" },
                        lineHeight: 1.25,
                        px: { xs: 0.5, sm: 1 },
                        borderLeft: `1px solid ${theme.palette.divider}`,
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
                  <TableRow key={row.label} hover>
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        fontSize: { xs: "0.65rem", sm: "0.8rem" },
                        whiteSpace: "nowrap",
                        px: { xs: 0.75, sm: 1.25 },
                        position: "sticky",
                        left: 0,
                        zIndex: 1,
                        backgroundColor:
                          theme.palette.mode === "dark"
                            ? theme.palette.grey[900]
                            : theme.palette.background.paper,
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
                          whiteSpace: "nowrap",
                          px: { xs: 0.5, sm: 1 },
                          borderLeft: `1px solid ${theme.palette.divider}`,
                          ...(row.label === "BTC Price (USD)" && index === 0
                            ? { backgroundColor: "rgba(255, 193, 7, 0.35)" }
                            : {}),
                          ...(row.label === "BTC Price (USD)" &&
                          index === 8 &&
                          selectedOS === "CUSTOM"
                            ? { backgroundColor: "rgba(103, 177, 42, 0.35)" } // graph's Custom OS green
                            : {}),
                          ...(row.label === "BTC Price (USD)" &&
                          index === 8 &&
                          selectedOS === "STOCK"
                            ? { backgroundColor: "rgba(21, 101, 192, 0.35)" } // graph's Stock OS blue
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
        </>
      )}
    </Box>
  );
}
