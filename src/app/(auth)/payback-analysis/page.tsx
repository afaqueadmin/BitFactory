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

// Constants
const POOL_COMMISSION = 0.025; // 2.5%
const STOCK_HASHRATE_TH = 236; // TH
const LUX_HASHRATE_TH = 252; // TH
const ELECTRICITY_CHARGES = 199; // USD
const MACHINE_COST = 3850; // USD

// Scenario BTC prices
const SCENARIO_BTC_PRICES = [100000, 125000, 150000, 200000, 63500];

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
): number => {
  const hashratePh = thToPh(hashrateTh);
  return hashratePh * rewardBtcPerPhDay * (1 - POOL_COMMISSION);
};

const calculateMonthlyRevenue = (
  dailyBtc: number,
  btcPrice: number,
): number => {
  return (dailyBtc * btcPrice * 365) / 12;
};

const calculateNetRevenue = (monthlyRevenue: number): number => {
  return monthlyRevenue - ELECTRICITY_CHARGES;
};

const calculatePaybackMonths = (netRevenue: number): number => {
  if (netRevenue <= 0) return Infinity;
  return MACHINE_COST / netRevenue;
};

const calculateAllValues = (
  btcPrice: number,
  rewardBtcPerPhDay: number,
): CalculationValues => {
  const dailyBtcStock = calculateDailyBtc(STOCK_HASHRATE_TH, rewardBtcPerPhDay);
  const dailyBtcLux = calculateDailyBtc(LUX_HASHRATE_TH, rewardBtcPerPhDay);

  const monthlyRevenueStock = calculateMonthlyRevenue(dailyBtcStock, btcPrice);
  const monthlyRevenueLux = calculateMonthlyRevenue(dailyBtcLux, btcPrice);

  const netRevenueStock = calculateNetRevenue(monthlyRevenueStock);
  const netRevenueLux = calculateNetRevenue(monthlyRevenueLux);

  const paybackMonthsStock = calculatePaybackMonths(netRevenueStock);
  const paybackMonthsLux = calculatePaybackMonths(netRevenueLux);

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

const staticRows: Array<{
  label: string;
  values: Array<string | number>;
}> = [
  {
    label: "Pool Commission",
    values: ["2.50%", "2.50%", "2.50%", "2.50%", "2.50%", "2.50%"],
  },
  {
    label: "S21Pro Hashrate (Stock OS)",
    values: [236, 236, 236, 236, 236, 236],
  },
  {
    label: "S21Pro Hashrate (LUXOS)",
    values: [252, 252, 252, 252, 252, 252],
  },
];

export default function PaybackAnalysisPage() {
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

  // Recalculate values when BTC price or reward changes
  useEffect(() => {
    if (liveBtcPriceValue !== null && liveRewardBtcPerPhDay !== null) {
      // Calculate for CURRENT (index 0)
      const currentCalc = calculateAllValues(
        liveBtcPriceValue,
        liveRewardBtcPerPhDay,
      );

      // Calculate for each scenario with different BTC price
      const scenarioCalcs = SCENARIO_BTC_PRICES.map((price) =>
        calculateAllValues(price, liveRewardBtcPerPhDay),
      );

      setCalculatedValues([currentCalc, ...scenarioCalcs]);
    }
  }, [liveBtcPriceValue, liveRewardBtcPerPhDay]);

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
      liveBtcPrice || "$67,953.35",
      "$100,000",
      "$125,000",
      "$150,000",
      "$200,000",
      "$63,500",
    ],
  };

  const rewardRow = {
    label: "Reward (BTC/PH/Day)",
    values: [
      liveRewardBtcPerPhDay?.toFixed(8) || "0.00044827",
      "0.00044827",
      "0.00044827",
      "0.00044827",
      "0.00044827",
      "0.00044827",
    ],
  };

  // Build dynamic rows for calculated values
  const dynamicRows: Array<{
    label: string;
    values: Array<string | number>;
  }> = [];

  if (calculatedValues.length > 0) {
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
      values: [
        "$199.00",
        "$199.00",
        "$199.00",
        "$199.00",
        "$199.00",
        "$199.00",
      ],
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

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
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
          <Button
            variant="outlined"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Refresh BTC Price"}
          </Button>
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
            <Typography>$0.0780 — $199.00</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Power Consumption
            </Typography>
            <Typography>3.5550 KWH</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Machine Purchase Price
            </Typography>
            <Typography>$3,850.00</Typography>
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
                <TableCell sx={{ fontWeight: 600 }}>{row.label}</TableCell>
                {row.values.map((value, index) => (
                  <TableCell
                    key={`${row.label}-${index}`}
                    align="right"
                    sx={
                      (row.label === "BTC Price (USD)" && index === 0) ||
                      (row.label === "Reward (BTC/PH/Day)" && index === 0)
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
