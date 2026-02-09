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

const rows: Array<{
  label: string;
  values: Array<string | number>;
}> = [
  {
    label: "Reward (BTC/PH/Day)",
    values: [
      "0.00044827",
      "0.00044827",
      "0.00044827",
      "0.00044827",
      "0.00044827",
      "0.00044827",
    ],
  },
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
  {
    label: "Daily BTC Reward (Stock OS)",
    values: [
      "0.00010315",
      "0.00010315",
      "0.00010315",
      "0.00010315",
      "0.00010315",
      "0.00010315",
    ],
  },
  {
    label: "Daily BTC Reward (LUX OS)",
    values: [
      "0.00011014",
      "0.00011014",
      "0.00011014",
      "0.00011014",
      "0.00011014",
      "0.00011014",
    ],
  },
  {
    label: "Monthly Revenue (Stock OS)",
    values: ["$213.20", "$313.74", "$392.17", "$470.61", "$627.48", "$199.22"],
  },
  {
    label: "Monthly Revenue (LUX OS)",
    values: ["$227.65", "$335.01", "$418.76", "$502.51", "$670.02", "$212.73"],
  },
  {
    label: "Electricity & Hosting Charges",
    values: ["$199.00", "$199.00", "$199.00", "$199.00", "$199.00", "$199.00"],
  },
  {
    label: "Net Revenue (Stock OS)",
    values: ["$14.20", "$114.74", "$193.17", "$271.61", "$428.48", "$0.22"],
  },
  {
    label: "Net Revenue (LUX OS)",
    values: ["$28.65", "$136.01", "$219.76", "$303.51", "$471.02", "$13.73"],
  },
  {
    label: "Payback Months (Stock OS)",
    values: [271, 34, 20, 14, 9, 17188],
  },
  {
    label: "Payback Months (LUX OS)",
    values: [134, 28, 18, 13, 8, 280],
  },
];

export default function PaybackAnalysisPage() {
  const [liveBtcPrice, setLiveBtcPrice] = useState<string | null>(null);
  const [liveBtcPriceValue, setLiveBtcPriceValue] = useState<number | null>(
    null,
  );
  const [liveRewardBtcPerPhDay, setLiveRewardBtcPerPhDay] = useState<
    string | null
  >(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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

      setLiveRewardBtcPerPhDay(rewardBtcPerPhDay.toFixed(8));
    } catch {
      // ignore and keep fallback
    }
  }, [liveBtcPriceValue]);

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
      liveRewardBtcPerPhDay || "0.00044827",
      "0.00044827",
      "0.00044827",
      "0.00044827",
      "0.00044827",
      "0.00044827",
    ],
  };

  const tableRows = [
    btcPriceRow,
    rewardRow,
    ...rows.filter((r) => r.label !== "Reward (BTC/PH/Day)"),
  ];

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
