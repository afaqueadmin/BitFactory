"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useBitcoinLivePrice } from "@/components/useBitcoinLivePrice";
import {
  fetchLiveBtc24hStats,
  Btc24hStats,
} from "@/lib/services/btcPriceService";
import StatCard from "@/components/daylight/StatCard";
import CurrencyBitcoinOutlinedIcon from "@mui/icons-material/CurrencyBitcoinOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";
import { MQ, useDaylight } from "@/lib/daylight";
import { Box } from "@mui/material";

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export default function LivePriceHeader() {
  const { d } = useDaylight();
  const { btcLiveData } = useBitcoinLivePrice();

  const { data: ticker24h } = useQuery<Btc24hStats>({
    queryKey: ["btc-ticker-24h"],
    queryFn: async () => {
      return await fetchLiveBtc24hStats();
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
  });

  const currentPrice = btcLiveData?.price
    ? typeof btcLiveData.price === "string"
      ? parseFloat(btcLiveData.price)
      : btcLiveData.price
    : (ticker24h?.price ?? null);
  const change = ticker24h ? ticker24h.priceChange : null;
  const changePercent = ticker24h ? ticker24h.priceChangePercent : null;
  const isUp = (change ?? 0) >= 0;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: { xs: "10px", sm: "16px" },
        mb: { xs: "18px", sm: "22px" },
        [MQ.stack]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
      }}
    >
      <StatCard
        title="Bitcoin Price"
        value={currentPrice != null ? formatCurrency(currentPrice) : "—"}
        caption="Live BTC/USD"
        tone="sky"
        icon={<CurrencyBitcoinOutlinedIcon />}
        isLoading={currentPrice == null}
      />
      <StatCard
        title="24h Change"
        value={
          change != null && changePercent != null
            ? `${isUp ? "+" : ""}${changePercent.toFixed(2)}%`
            : "—"
        }
        caption={
          change != null ? `${isUp ? "+" : ""}${formatCurrency(change)}` : ""
        }
        tone={isUp ? "mint" : "danger"}
        valueColor={isUp ? d.success : d.danger}
        icon={isUp ? <TrendingUpOutlinedIcon /> : <TrendingDownOutlinedIcon />}
        isLoading={change == null}
      />
      <StatCard
        title="24h High"
        value={ticker24h ? formatCurrency(ticker24h.highPrice) : "—"}
        tone="mint"
        valueColor={d.success}
        icon={<TrendingUpOutlinedIcon />}
        isLoading={!ticker24h}
      />
      <StatCard
        title="24h Low"
        value={ticker24h ? formatCurrency(ticker24h.lowPrice) : "—"}
        tone="danger"
        valueColor={d.danger}
        icon={<TrendingDownOutlinedIcon />}
        isLoading={!ticker24h}
      />
    </Box>
  );
}
