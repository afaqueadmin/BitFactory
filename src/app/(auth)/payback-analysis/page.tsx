"use client";

import {
  Box,
  Container,
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
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";

const columns = [
  "CURRENT",
  "Scenario: 1",
  "Scenario: 2",
  "Scenario: 3",
  "Scenario: 4",
  "BREAKEVEN",
];

// Fallback constants (only used if API fails)
const FALLBACK_BTC_PRICE = 67953.35; // USD
const FALLBACK_REWARD_BTC_PER_PH_DAY = 0.00044827;

// Scenario BTC prices (first 4 are fixed, last one comes from DB)
const FIXED_SCENARIO_PRICES = [100000, 125000, 150000, 200000];

// Interface for config data from API
interface PaybackConfigData {
  hostingCharges: number;
  monthlyInvoicingAmount: number;
  powerConsumption: number;
  machineCapitalCost: number;
  poolCommission: number;
  s21proHashrateStockOs: number;
  s21proHashrateLuxos: number;
  breakevenBtcPrice: number;
  invoicedAmount: number;
}

// Types for calculations
interface CalculationValues {
  dailyBtcStock: number;
  dailyBtcLux: number;
  monthlyRevenueStock: number;
  monthlyRevenueLux: number;
  netRevenueStock: number;
  netRevenueLux: number;
  paybackMonthsStock: number;
  paybackMonthsLux: number;
}

// Helper functions for calculations
const thToPh = (th: number): number => th / 1000;

const calculateDailyBtc = (
  hashrateTh: number,
  rewardBtcPerPhDay: number,
  poolCommission: number,
): number => {
  const hashratePh = thToPh(hashrateTh);
  return hashratePh * rewardBtcPerPhDay * (1 - poolCommission / 100);
};

const calculateMonthlyRevenue = (
  dailyBtc: number,
  btcPrice: number,
): number => {
  return (dailyBtc * btcPrice * 365) / 12;
};

const calculateNetRevenue = (
  monthlyRevenue: number,
  monthlyElectricityHosting: number,
): number => {
  return monthlyRevenue - monthlyElectricityHosting;
};

const calculatePaybackMonths = (
  netRevenue: number,
  machineCost: number,
): number => {
  if (netRevenue <= 0) return Infinity;
  return machineCost / netRevenue;
};

const formatUsd = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const calculateAllValues = (
  btcPrice: number,
  rewardBtcPerPhDay: number,
  config: PaybackConfigData,
  monthlyElectricityHosting: number,
  machineCost: number,
): CalculationValues => {
  const dailyBtcStock = calculateDailyBtc(
    config.s21proHashrateStockOs,
    rewardBtcPerPhDay,
    config.poolCommission,
  );
  const dailyBtcLux = calculateDailyBtc(
    config.s21proHashrateLuxos,
    rewardBtcPerPhDay,
    config.poolCommission,
  );

  const monthlyRevenueStock = calculateMonthlyRevenue(dailyBtcStock, btcPrice);
  const monthlyRevenueLux = calculateMonthlyRevenue(dailyBtcLux, btcPrice);

  const netRevenueStock = calculateNetRevenue(
    monthlyRevenueStock,
    monthlyElectricityHosting,
  );
  const netRevenueLux = calculateNetRevenue(
    monthlyRevenueLux,
    monthlyElectricityHosting,
  );

  const paybackMonthsStock = calculatePaybackMonths(
    netRevenueStock,
    machineCost,
  );
  const paybackMonthsLux = calculatePaybackMonths(netRevenueLux, machineCost);

  return {
    dailyBtcStock,
    dailyBtcLux,
    monthlyRevenueStock,
    monthlyRevenueLux,
    netRevenueStock,
    netRevenueLux,
    paybackMonthsStock,
    paybackMonthsLux,
  };
};

export default function PaybackAnalysisPage() {
  // Config state
  const [config, setConfig] = useState<PaybackConfigData | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  // User role and invoiced amount state
  const [userRole, setUserRole] = useState<string | null>(null);
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

  // Calculated values for all scenarios
  const [calculatedValues, setCalculatedValues] = useState<CalculationValues[]>(
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

        // Set editable invoiced amount based on user role
        if (data.userRole === "ADMIN") {
          // Admin default: 4250
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
      const response = await fetch("/api/miners/summary", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) return;
      const data = (await response.json()) as {
        success: boolean;
        data?: { hashprice?: Array<{ currency_type: string; value: number }> };
      };

      if (!data.success || !data.data?.hashprice?.length) return;

      const hashprice = data.data.hashprice[0];
      if (!hashprice || !Number.isFinite(hashprice.value)) return;

      let rewardBtcPerPhDay = hashprice.value;

      if (
        hashprice.currency_type !== "BTC" &&
        liveBtcPriceValue &&
        liveBtcPriceValue > 0
      ) {
        rewardBtcPerPhDay = hashprice.value / liveBtcPriceValue;
      }

      setLiveRewardBtcPerPhDay(rewardBtcPerPhDay);
    } catch {
      // ignore and keep fallback
    }
  }, [liveBtcPriceValue]);

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

      // For ADMIN: just use the value temporarily (no API call)
      if (userRole === "ADMIN") {
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

  // Calculate derived values from config
  const monthlyElectricityHosting = config ? config.monthlyInvoicingAmount : 0;
  const machineCost = config
    ? parseFloat(editableInvoicedAmount || "0") - config.monthlyInvoicingAmount
    : 0;

  // Recalculate values when BTC price, reward, or config changes
  useEffect(() => {
    if (!config) return;

    // Build scenario prices: fixed scenarios + breakeven from DB
    const scenarioPrices = [...FIXED_SCENARIO_PRICES, config.breakevenBtcPrice];

    // Calculate for CURRENT (index 0)
    const currentCalc = calculateAllValues(
      resolvedBtcPriceValue,
      resolvedRewardBtcPerPhDay,
      config,
      monthlyElectricityHosting,
      machineCost,
    );

    // Calculate for each scenario with different BTC price
    const scenarioCalcs = scenarioPrices.map((price) =>
      calculateAllValues(
        price,
        resolvedRewardBtcPerPhDay,
        config,
        monthlyElectricityHosting,
        machineCost,
      ),
    );

    setCalculatedValues([currentCalc, ...scenarioCalcs]);
  }, [
    resolvedBtcPriceValue,
    resolvedRewardBtcPerPhDay,
    config,
    monthlyElectricityHosting,
    machineCost,
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
      liveBtcPrice || formatUsd(resolvedBtcPriceValue),
      "$100,000",
      "$125,000",
      "$150,000",
      "$200,000",
      config ? formatUsd(config.breakevenBtcPrice) : "$63,500",
    ],
  };

  const rewardRow = {
    label: "Reward (BTC/PH/Day)",
    values: Array.from({ length: 6 }, () =>
      resolvedRewardBtcPerPhDay.toFixed(8),
    ),
  };

  // Build static rows from config
  const staticRows: Array<{
    label: string;
    values: Array<string | number>;
  }> = config
    ? [
        {
          label: "Pool Commission",
          values: Array.from(
            { length: 6 },
            () => `${config.poolCommission.toFixed(2)}%`,
          ),
        },
        {
          label: "S21Pro Hashrate (Stock OS)",
          values: Array.from({ length: 6 }, () =>
            config.s21proHashrateStockOs.toFixed(2),
          ),
        },
        {
          label: "S21Pro Hashrate (LUXOS)",
          values: Array.from({ length: 6 }, () =>
            config.s21proHashrateLuxos.toFixed(2),
          ),
        },
      ]
    : [];

  // Build dynamic rows for calculated values
  const dynamicRows: Array<{
    label: string;
    values: Array<string | number>;
  }> = [];

  if (calculatedValues.length > 0 && config) {
    dynamicRows.push({
      label: "Daily BTC Reward (Stock OS)",
      values: calculatedValues.map((calc) => calc.dailyBtcStock.toFixed(8)),
    });
    dynamicRows.push({
      label: "Daily BTC Reward (LUX OS)",
      values: calculatedValues.map((calc) => calc.dailyBtcLux.toFixed(8)),
    });
    dynamicRows.push({
      label: "Monthly Revenue (Stock OS)",
      values: calculatedValues.map(
        (calc) => `$${calc.monthlyRevenueStock.toFixed(2)}`,
      ),
    });
    dynamicRows.push({
      label: "Monthly Revenue (LUX OS)",
      values: calculatedValues.map(
        (calc) => `$${calc.monthlyRevenueLux.toFixed(2)}`,
      ),
    });
    dynamicRows.push({
      label: "Electricity & Hosting Charges",
      values: Array.from(
        { length: 6 },
        () => `$${monthlyElectricityHosting.toFixed(2)}`,
      ),
    });
    dynamicRows.push({
      label: "Net Revenue (Stock OS)",
      values: calculatedValues.map(
        (calc) => `$${calc.netRevenueStock.toFixed(2)}`,
      ),
    });
    dynamicRows.push({
      label: "Net Revenue (LUX OS)",
      values: calculatedValues.map(
        (calc) => `$${calc.netRevenueLux.toFixed(2)}`,
      ),
    });
    dynamicRows.push({
      label: "Payback Months (Stock OS)",
      values: calculatedValues.map((calc) =>
        calc.paybackMonthsStock === Infinity
          ? "∞"
          : Math.round(calc.paybackMonthsStock),
      ),
    });
    dynamicRows.push({
      label: "Payback Months (LUX OS)",
      values: calculatedValues.map((calc) =>
        calc.paybackMonthsLux === Infinity
          ? "∞"
          : Math.round(calc.paybackMonthsLux),
      ),
    });
  }

  const tableRows = [btcPriceRow, rewardRow, ...staticRows, ...dynamicRows];

  // Show loading state
  if (configLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
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
      </Container>
    );
  }

  // Show error state
  if (configError || !config) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 3 }}>
          {configError || "Failed to load configuration"}
        </Alert>
        <Button variant="contained" onClick={fetchConfig}>
          Retry
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
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

      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            Payback Analysis
          </Typography>
          <Box
            sx={{
              display: "flex",
              gap: 2,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
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
              sx={{ width: "180px" }}
            />
            <Button
              variant="contained"
              onClick={handleUpdateInvoicedAmount}
              disabled={isUpdatingInvoiced}
              size="medium"
            >
              {isUpdatingInvoiced ? "Updating..." : "Update"}
            </Button>
            <Button
              variant="outlined"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh BTC Price"}
            </Button>
          </Box>
        </Box>
        <Typography color="text.secondary">
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

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Document
            </Typography>
            <Typography>Payback Analysis</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Hosting Charges
            </Typography>
            <Typography>{`$${config.hostingCharges.toFixed(5)}`}</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Monthly Invoicing Amount
            </Typography>
            <Typography>{formatUsd(config.monthlyInvoicingAmount)}</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Power Consumption
            </Typography>
            <Typography>{`${config.powerConsumption.toFixed(4)} KWH`}</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Invoiced Amount
            </Typography>
            <Typography>
              {formatUsd(parseFloat(editableInvoicedAmount || "0"))}
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Machine/Capital Cost
            </Typography>
            <Typography>{formatUsd(machineCost)}</Typography>
          </Box>
        </Box>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Metric</TableCell>
              {columns.map((column) => (
                <TableCell key={column} sx={{ fontWeight: 700 }} align="right">
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
                    ...(row.label === "Reward (BTC/PH/Day)" && {
                      backgroundColor: "#FFF3C4",
                      fontWeight: 700,
                    }),
                  }}
                >
                  {row.label}
                </TableCell>
                {row.values.map((value, index) => (
                  <TableCell
                    key={`${row.label}-${index}`}
                    align="right"
                    sx={
                      (row.label === "BTC Price (USD)" && index === 0) ||
                      row.label === "Reward (BTC/PH/Day)"
                        ? {
                            backgroundColor: "#FFF3C4",
                            fontWeight: 700,
                          }
                        : undefined
                    }
                  >
                    {value}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}
