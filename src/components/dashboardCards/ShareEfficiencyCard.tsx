import GradientStatCard from "@/components/GradientStatCard";
import React from "react";
import { formatValue } from "@/lib/helpers/formatValue";

/**
 * Built from the Shares Efficiency line colour in HashrateHistoryChart
 * (#f03131) so the card and the chart series read as the same metric.
 */
const EFFICIENCY_GRADIENT = "linear-gradient(135deg, #f03131 0%, #b71c1c 100%)";

const ShareEfficiencyCard = ({
  value,
  loading,
  poolMode = "total",
}: {
  value: number;
  loading: boolean;
  poolMode?: "total" | "luxor" | "braiins";
}) => {
  // Braiins API does not provide efficiency_5m
  if (poolMode === "braiins" && !loading && value === 0) {
    return (
      <GradientStatCard
        title="Share Efficiency (5 min)"
        value="ℹ️ Not available"
        caption="Braiins pool API does not provide efficiency data"
        gradient={EFFICIENCY_GRADIENT}
        isLoading={loading}
      />
    );
  }

  return (
    <GradientStatCard
      title="Share Efficiency (5 min)"
      value={formatValue(value, "percentage")}
      gradient={EFFICIENCY_GRADIENT}
      isLoading={loading}
    />
  );
};

export default ShareEfficiencyCard;
