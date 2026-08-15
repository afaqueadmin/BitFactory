import GradientStatCard from "@/components/GradientStatCard";
import React from "react";
import { formatValue } from "@/lib/helpers/formatValue";

/**
 * The purple used by the wallet page's Revenue (24 Hours) card (#9c27b0 light
 * / #6a1b9a dark), reused for the Uptime series in HashrateHistoryChart.
 */
const UPTIME_GRADIENT = "linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)";

const Uptime24HoursCard = ({
  value,
  loading,
  poolMode = "total",
}: {
  value: number;
  loading: boolean;
  poolMode?: "total" | "luxor" | "braiins";
}) => {
  // Braiins API does not provide uptime_24h
  if (poolMode === "braiins" && !loading && value === 0) {
    return (
      <GradientStatCard
        title="Uptime (24 hours)"
        value="ℹ️ Not available"
        caption="Braiins pool API does not provide uptime data"
        gradient={UPTIME_GRADIENT}
        isLoading={loading}
      />
    );
  }

  return (
    <GradientStatCard
      title="Uptime (24 hours)"
      value={formatValue(value, "percentage")}
      gradient={UPTIME_GRADIENT}
      isLoading={loading}
    />
  );
};

export default Uptime24HoursCard;
