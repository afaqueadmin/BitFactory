"use client";

/**
 * Miners page (authenticated) - BitFactory Daylight theme (v1.3)
 *
 * Composes:
 * - Page heading + pool mode Segmented control (Total / Luxor / Braiins)
 * - Four Daylight KPI StatCards (efficiency, hashrate, uptime, hashprice)
 * - HashrateHistoryChart (Daylight variant)
 * - Pool comparison cards (only in Total mode, with more than one pool)
 * - Miner filter PillTabs + HostedMinersList (Daylight variant)
 *
 * Layout mirrors the dashboard page: max content width 1600px (page padding
 * comes from the (auth) layout), KPI row 4 columns / 2 below 960px.
 */

import { Box, Typography } from "@mui/material";
import HostedMinersList from "@/components/HostedMinersList";
import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SsidChartOutlinedIcon from "@mui/icons-material/SsidChartOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import HashrateHistoryChart from "@/components/HashrateHistoryChart";
import StatCard from "@/components/daylight/StatCard";
import Segmented, { SegmentedOption } from "@/components/daylight/Segmented";
import PillTab from "@/components/daylight/PillTab";
import { formatHashrate } from "@/lib/workerNormalization";
import { formatValue } from "@/lib/helpers/formatValue";
import { useSubaccountFilter } from "@/lib/contexts/subaccountFilter-context";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

interface MinersSummary {
  totalHashrate: number;
  activeMiners: number;
  totalRevenue: number;
  hashprice: number;
  efficiency_5m: number;
  uptime_24h: number;
  activePoolNames: string[];
  pools: {
    luxor: {
      miners: number;
      hashrate: number;
      activeWorkers: number;
      hashprice: number;
      efficiency_5m: number;
      uptime_24h: number;
    };
    braiins: {
      miners: number;
      hashrate: number;
      activeWorkers: number;
      hashprice: number;
      efficiency_5m: number;
      uptime_24h: number;
    };
  };
}

type PoolMode = "total" | "luxor" | "braiins";

const EMPTY_SUMMARY: MinersSummary = {
  totalHashrate: 0,
  activeMiners: 0,
  totalRevenue: 0,
  hashprice: 0,
  efficiency_5m: 0,
  uptime_24h: 0,
  activePoolNames: [],
  pools: {
    luxor: {
      miners: 0,
      hashrate: 0,
      activeWorkers: 0,
      hashprice: 0,
      efficiency_5m: 0,
      uptime_24h: 0,
    },
    braiins: {
      miners: 0,
      hashrate: 0,
      activeWorkers: 0,
      hashprice: 0,
      efficiency_5m: 0,
      uptime_24h: 0,
    },
  },
};

const POOL_MODE_OPTIONS: SegmentedOption<PoolMode>[] = [
  { id: "total", label: "Total" },
  { id: "luxor", label: "Luxor" },
  { id: "braiins", label: "Braiins" },
];

export default function Miners() {
  const { d, fonts } = useDaylight();
  const { queryParam: subaccountsParam } = useSubaccountFilter();
  const [poolMode, setPoolMode] = useState<PoolMode>("total");
  const [minerFilter, setMinerFilter] = useState<"all" | "luxor" | "braiins">(
    "all",
  );

  // Fetch miners summary using TanStack Query
  const {
    data: minersSummary = { data: EMPTY_SUMMARY },
    isLoading: summaryLoading,
  } = useQuery({
    queryKey: ["miners-summary", subaccountsParam],
    queryFn: async () => {
      const response = await fetch(
        `/api/miners/summary?subaccounts=${subaccountsParam}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        console.error("Failed to fetch miners summary");
        return { data: EMPTY_SUMMARY };
      }

      const result = await response.json();
      console.log("[Miners Page] API Response Data:", result.data);
      return result;
    },
  });

  const data = minersSummary.data as MinersSummary;
  const hasMultiplePools =
    !!data.activePoolNames && data.activePoolNames.length > 1;

  // Reset poolMode if not applicable
  useEffect(() => {
    if (data.activePoolNames && data.activePoolNames.length > 0) {
      if (!data.activePoolNames.includes("Luxor") && poolMode === "luxor") {
        setPoolMode("total");
      }
      if (!data.activePoolNames.includes("Braiins") && poolMode === "braiins") {
        setPoolMode("total");
      }
    }
  }, [data.activePoolNames, poolMode]);

  // Get values based on selected pool mode. Note: the root summary's
  // aggregate hashrate field is named `totalHashrate`, not `hashrate` - only
  // the per-pool breakdown uses `hashrate`.
  const getMetric = (
    metric: "hashrate" | "hashprice" | "efficiency_5m" | "uptime_24h",
  ) => {
    if (poolMode === "total") {
      return metric === "hashrate" ? data.totalHashrate : data[metric];
    }
    return data.pools?.[poolMode]?.[metric];
  };

  const isBraiinsMode = poolMode === "braiins";
  const efficiency = getMetric("efficiency_5m") || 0;
  const uptime = getMetric("uptime_24h") || 0;
  const hashprice = getMetric("hashprice") || 0;
  // Braiins publishes neither share efficiency nor uptime, and no hashprice.
  const efficiencyUnavailable = isBraiinsMode && !summaryLoading;
  const uptimeUnavailable = isBraiinsMode && !summaryLoading;
  const hashpriceUnavailable = isBraiinsMode && !summaryLoading;

  const luxorMiners = data.pools?.luxor?.miners || 0;
  const braiinsMiners = data.pools?.braiins?.miners || 0;

  return (
    <Box
      sx={{ maxWidth: 1600, mx: "auto", fontFamily: fonts.body, color: d.text }}
    >
      {/* Page heading */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
          mb: { xs: "20px", md: "26px" },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 750,
              fontSize: { xs: 27, md: 32 },
              lineHeight: 1.3,
              letterSpacing: "-.035em",
              color: d.text,
            }}
          >
            Miners
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: 12, md: 13 },
              lineHeight: { xs: 1.7, md: 1.5 },
              color: d.muted,
              mt: "7px",
            }}
          >
            Live performance and fleet health across your pools.
          </Typography>
        </Box>

        {hasMultiplePools && (
          <Segmented
            value={poolMode}
            onChange={setPoolMode}
            ariaLabel="Pool mode"
            options={POOL_MODE_OPTIONS.filter(
              (o) =>
                o.id === "total" ||
                data.activePoolNames.includes(
                  o.id === "luxor" ? "Luxor" : "Braiins",
                ),
            )}
          />
        )}
      </Box>

      {/* KPI cards - 4 columns, 2 below 960px */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: { xs: "10px", sm: "16px" },
          mb: { xs: "18px", sm: "22px" },
          "@media (max-width:959.95px)": {
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          },
        }}
      >
        <StatCard
          title="Share Efficiency (5 min)"
          value={
            efficiencyUnavailable
              ? "Not available"
              : formatValue(efficiency, "percentage")
          }
          caption={
            efficiencyUnavailable
              ? "Braiins doesn't report share efficiency"
              : "Last 5 minutes"
          }
          tone="sky"
          icon={<SsidChartOutlinedIcon />}
          isLoading={summaryLoading}
        />
        <StatCard
          title="Hashrate (24 hours)"
          value={formatHashrate(getMetric("hashrate") || 0)}
          caption="Average over the last 24 hours"
          tone="sky"
          icon={<BoltOutlinedIcon />}
          isLoading={summaryLoading}
        />
        <StatCard
          title="Uptime (24 hours)"
          value={
            uptimeUnavailable
              ? "Not available"
              : formatValue(uptime, "percentage")
          }
          caption={
            uptimeUnavailable
              ? "Braiins doesn't report uptime"
              : "Last 24 hours"
          }
          tone="mint"
          icon={<AccessTimeOutlinedIcon />}
          isLoading={summaryLoading}
        />
        <StatCard
          title="Hashprice"
          value={
            hashpriceUnavailable
              ? "Not available"
              : formatValue(hashprice, "BTC", {
                  minimumFractionDigits: 5,
                  maximumFractionDigits: 5,
                })
          }
          caption={
            hashpriceUnavailable
              ? "Braiins doesn't report hashprice"
              : "BTC / PH/s / day"
          }
          tone="amber"
          icon={<ShowChartOutlinedIcon />}
          isLoading={summaryLoading}
        />
      </Box>

      {/* Hashrate & Shares Efficiency history — follows the pool toggle above */}
      <HashrateHistoryChart
        daylight
        poolMode={poolMode}
        subaccountsParam={subaccountsParam}
      />

      {/* Pool Comparison Cards - Only show if multiple pools and in total mode */}
      {poolMode === "total" && hasMultiplePools && data.pools && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: { xs: "12px", sm: "16px" },
            mb: { xs: "18px", md: "22px" },
          }}
        >
          <PoolSummaryCard
            label="Luxor Pool"
            dot={d.poolLuxor}
            miners={luxorMiners}
            hashrate={data.pools.luxor.hashrate}
            active={data.pools.luxor.activeWorkers}
          />
          <PoolSummaryCard
            label="Braiins Pool"
            dot={d.poolBraiins}
            miners={braiinsMiners}
            hashrate={data.pools.braiins.hashrate}
            active={data.pools.braiins.activeWorkers}
          />
        </Box>
      )}

      {/* Miner Filter Buttons - Only show if multiple pools */}
      {hasMultiplePools && (
        <Box
          sx={{
            display: "flex",
            gap: "4px",
            mb: "18px",
            overflowX: "auto",
            pb: { xs: "4px", sm: 0 },
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          <PillTab
            active={minerFilter === "all"}
            onClick={() => setMinerFilter("all")}
          >
            All Miners ({luxorMiners + braiinsMiners})
          </PillTab>

          {data.activePoolNames.includes("Luxor") && (
            <PillTab
              active={minerFilter === "luxor"}
              onClick={() => setMinerFilter("luxor")}
              dot={d.poolLuxor}
            >
              Luxor ({luxorMiners})
            </PillTab>
          )}

          {data.activePoolNames.includes("Braiins") && (
            <PillTab
              active={minerFilter === "braiins"}
              onClick={() => setMinerFilter("braiins")}
              dot={d.poolBraiins}
            >
              Braiins ({braiinsMiners})
            </PillTab>
          )}
        </Box>
      )}

      {/* Hosted Miners List with Pool Filter */}
      <HostedMinersList
        daylight
        poolFilter={minerFilter}
        repairButtonLabel="Repair history"
        subaccountsParam={subaccountsParam}
      />
    </Box>
  );
}

/** Daylight pool comparison card: coloured dot + label header, 3-column
 * mini stats (Miners / Hashrate / Active), matching the guide's card chrome. */
function PoolSummaryCard({
  label,
  dot,
  miners,
  hashrate,
  active,
}: {
  label: string;
  dot: string;
  miners: number;
  hashrate: number;
  active: number;
}) {
  const { d, fonts } = useDaylight();

  return (
    <Box
      sx={{
        p: { xs: "16px 18px", sm: "20px 22px" },
        bgcolor: d.surface,
        border: `1px solid ${d.border}`,
        borderRadius: RADIUS_CARD,
        boxShadow: d.shadow,
        fontFamily: fonts.body,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          mb: "16px",
          fontFamily: fonts.heading,
          fontWeight: 700,
          fontSize: 15,
          color: d.text,
        }}
      >
        <Box
          component="span"
          aria-hidden
          sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: dot }}
        />
        {label}
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "10px",
        }}
      >
        <PoolStat label="Miners" value={miners} />
        <PoolStat label="Hashrate" value={formatHashrate(hashrate)} />
        <PoolStat label="Active" value={active} color={d.success} />
      </Box>
    </Box>
  );
}

function PoolStat({
  label,
  value,
  color,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
}) {
  const { d, fonts } = useDaylight();
  return (
    <Box>
      <Box
        sx={{
          fontSize: 10,
          color: d.muted,
          mb: "3px",
          fontFamily: fonts.body,
        }}
      >
        {label}
      </Box>
      <Box
        sx={{
          fontWeight: 700,
          fontSize: 13,
          color: color || d.text,
          fontFamily: fonts.body,
        }}
      >
        {value}
      </Box>
    </Box>
  );
}
