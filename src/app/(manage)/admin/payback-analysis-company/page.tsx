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
  useTheme,
  useMediaQuery,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { formatValue } from "@/lib/helpers/formatValue";
import {
  MinerModel,
  MINER_LABELS,
  FALLBACK_BTC_PRICE,
  FALLBACK_REWARD_BTC_PER_PH_DAY,
  FIXED_SCENARIO_PRICES,
  CalculationValues,
  calculateBreakevenBtcPrice,
  calculateAllValues,
} from "@/lib/helpers/paybackCalculations";

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

// Interface for config data from API
interface PaybackConfigData {
  hostingCharges: number;
  monthlyInvoicingAmount: number;
  powerConsumption: number;
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

export default function PaybackAnalysisCompanyPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Config state
  const [config, setConfig] = useState<PaybackConfigData | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  // Editable machine cost (per miner model) / operating cost state
  const [editableS21ProMachineCost, setEditableS21ProMachineCost] =
    useState<string>("");
  const [editableS21XpMachineCost, setEditableS21XpMachineCost] =
    useState<string>("");
  const [editableOperatingCost, setEditableOperatingCost] =
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

  // OS selector state
  const [selectedOS, setSelectedOS] = useState<
    "STOCK" | "CUSTOM" | "COMPARISON"
  >("STOCK");

  // Miner selector state
  const [selectedMiner, setSelectedMiner] = useState<MinerModel>("S21PRO");

  // Calculated values for all scenarios
  const [calculatedValues, setCalculatedValues] = useState<CalculationValues[]>(
    [],
  );

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
        setEditableOperatingCost(String(data.data.monthlyInvoicingAmount));
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
    const operatingCostValue = parseFloat(editableOperatingCost);

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
    if (!Number.isFinite(operatingCostValue) || operatingCostValue < 0) {
      setCostsUpdateError("Please enter a valid operating cost");
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
          monthlyInvoicingAmount: operatingCostValue,
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
              monthlyInvoicingAmount: operatingCostValue,
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
    editableOperatingCost,
  ]);

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

  // Calculate derived values from config, using the editable fields so the
  // table recalculates live as the user types before saving.
  const monthlyElectricityHosting = config
    ? parseFloat(editableOperatingCost) || 0
    : 0;

  // The machine cost input tracks whichever miner model tab is active
  const editableActiveMachineCost =
    selectedMiner === "S21XP"
      ? editableS21XpMachineCost
      : editableS21ProMachineCost;
  const setEditableActiveMachineCost =
    selectedMiner === "S21XP"
      ? setEditableS21XpMachineCost
      : setEditableS21ProMachineCost;

  // Company self-mining: machine cost is the machine's own capital cost,
  // there is no client invoice to offset against.
  const machineCost = config ? parseFloat(editableActiveMachineCost) || 0 : 0;

  // Resolve hashrate for the currently selected miner model
  const activeHashrateStockOs = config
    ? selectedMiner === "S21XP"
      ? config.s21xpHashrateStockOs
      : config.s21proHashrateStockOs
    : 0;
  const activeHashrateLuxos = config
    ? selectedMiner === "S21XP"
      ? config.s21xpHashrateLuxos
      : config.s21proHashrateLuxos
    : 0;

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
    if (!config) return;

    // Build scenario prices: fixed scenarios + calculated breakeven
    const scenarioPrices = [...FIXED_SCENARIO_PRICES, selectedBreakevenPrice];

    // Calculate for CURRENT (index 0)
    const currentCalc = calculateAllValues(
      resolvedBtcPriceValue,
      resolvedRewardBtcPerPhDay,
      activeHashrateStockOs,
      activeHashrateLuxos,
      config.poolCommissionStockOs,
      config.poolCommissionLuxos,
      monthlyElectricityHosting,
      machineCost,
    );

    // Calculate for each scenario with different BTC price
    const scenarioCalcs = scenarioPrices.map((price) =>
      calculateAllValues(
        price,
        resolvedRewardBtcPerPhDay,
        activeHashrateStockOs,
        activeHashrateLuxos,
        config.poolCommissionStockOs,
        config.poolCommissionLuxos,
        monthlyElectricityHosting,
        machineCost,
      ),
    );

    setCalculatedValues([currentCalc, ...scenarioCalcs]);
  }, [
    resolvedBtcPriceValue,
    resolvedRewardBtcPerPhDay,
    activeHashrateStockOs,
    activeHashrateLuxos,
    config,
    monthlyElectricityHosting,
    machineCost,
    selectedBreakevenPrice,
    selectedOS,
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
            activeHashrateStockOs.toFixed(2),
          ),
        },
        {
          label: `${MINER_LABELS[selectedMiner]} Hashrate (TH) (Custom OS)`,
          values: Array.from({ length: 9 }, () =>
            activeHashrateLuxos.toFixed(2),
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
      values: calculatedValues.map(
        (calc) => `$${calc.monthlyRevenueStock.toFixed(2)}`,
      ),
    });
    allDynamicRows.push({
      label: "Monthly Revenue (Custom OS)",
      values: calculatedValues.map(
        (calc) => `$${calc.monthlyRevenueLux.toFixed(2)}`,
      ),
    });
    allDynamicRows.push({
      label: "Electricity & Hosting Charges",
      values: Array.from(
        { length: 9 },
        () => `$${monthlyElectricityHosting.toFixed(2)}`,
      ),
    });
    allDynamicRows.push({
      label: "Net Revenue (Stock OS)",
      values: calculatedValues.map(
        (calc) => `$${calc.netRevenueStock.toFixed(2)}`,
      ),
    });
    allDynamicRows.push({
      label: "Net Revenue (Custom OS)",
      values: calculatedValues.map(
        (calc) => `$${calc.netRevenueLux.toFixed(2)}`,
      ),
    });
    allDynamicRows.push({
      label: "Payback Months (Stock OS)",
      values: calculatedValues.map((calc, index) =>
        index === 8 // BREAKEVEN column
          ? "--"
          : calc.paybackMonthsStock === Infinity
            ? "∞"
            : Math.round(calc.paybackMonthsStock),
      ),
    });
    allDynamicRows.push({
      label: "Payback Months (Custom OS)",
      values: calculatedValues.map((calc, index) =>
        index === 8 // BREAKEVEN column
          ? "--"
          : calc.paybackMonthsLux === Infinity
            ? "∞"
            : Math.round(calc.paybackMonthsLux),
      ),
    });
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
    if (row.label === "Electricity & Hosting Charges") return true;
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
      {/* Success/Error messages for cost update */}
      {costsUpdateSuccess && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setCostsUpdateSuccess(null)}
        >
          {costsUpdateSuccess}
        </Alert>
      )}
      {costsUpdateError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setCostsUpdateError(null)}
        >
          {costsUpdateError}
        </Alert>
      )}

      <Box sx={{ mb: { xs: 2, md: 3 } }}>
        {/* Title + OS Toggle */}
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
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              fontSize: { xs: "1.6rem", sm: "2rem", md: "2.125rem" },
            }}
          >
            Company Payback Analysis
          </Typography>
          <ToggleButtonGroup
            value={selectedOS}
            exclusive
            onChange={(e, newValue) => {
              if (newValue !== null) setSelectedOS(newValue);
            }}
            aria-label="OS selector"
            size={isMobile ? "small" : "medium"}
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
        </Box>

        {/* Miner model tabs */}
        <Tabs
          value={selectedMiner}
          onChange={(e, newValue) => setSelectedMiner(newValue)}
          aria-label="Miner model selector"
          sx={{ mb: { xs: 1.5, sm: 2 }, minHeight: 36 }}
        >
          <Tab
            value="S21PRO"
            label="S21 Pro Analysis"
            sx={{ minHeight: 36, py: 0.5 }}
          />
          <Tab
            value="S21XP"
            label="S21 XP Analysis"
            sx={{ minHeight: 36, py: 0.5 }}
          />
        </Tabs>

        {/* Controls row */}
        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "stretch", sm: "center" },
            flexDirection: { xs: "column", sm: "row" },
            gap: { xs: 1.5, sm: 2 },
            flexWrap: "wrap",
          }}
        >
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
            sx={{ width: { xs: "100%", sm: "200px" } }}
          />

          <TextField
            label="Operating Cost (Monthly)"
            type="number"
            value={editableOperatingCost}
            onChange={(e) => setEditableOperatingCost(e.target.value)}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">$</InputAdornment>
              ),
            }}
            inputProps={{ step: "0.01", min: "0" }}
            sx={{ width: { xs: "100%", sm: "200px" } }}
          />

          <Button
            variant="contained"
            onClick={handleSaveCosts}
            disabled={isSavingCosts}
            size="small"
            fullWidth={isMobile}
          >
            {isSavingCosts ? "Saving..." : "Save Costs"}
          </Button>

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

      {/* Config summary card */}
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
            <Typography variant="body2">
              Company Payback Analysis (Self-Mining)
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Hosting Charges
            </Typography>
            <Typography variant="body2">{`$${config.hostingCharges.toFixed(5)}`}</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Operating Cost (Monthly)
            </Typography>
            <Typography variant="body2">
              {formatValue(monthlyElectricityHosting, "currency")}
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Power Consumption
            </Typography>
            <Typography variant="body2">{`${config.powerConsumption.toFixed(4)} KWH`}</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              {MINER_LABELS[selectedMiner]} Machine Cost
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
            <Typography variant="body2">Stock OS</Typography>
          </Box>
        </Box>
      </Paper>

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
              <TableRow
                key={row.label}
                hover
                sx={
                  row.label === "Reward (BTC/PH/Day)"
                    ? { backgroundColor: "rgba(103, 177, 42, 0.35)" }
                    : undefined
                }
              >
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
                      row.label === "Reward (BTC/PH/Day)"
                        ? "rgba(103, 177, 42, 0.35)"
                        : theme.palette.mode === "dark"
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
                        ? { backgroundColor: "rgba(103, 177, 42, 0.35)" }
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
  );
}
