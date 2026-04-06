import GradientStatCard from "@/components/GradientStatCard";
import React from "react";
import { formatValue } from "@/lib/helpers/formatValue";

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
        gradient="linear-gradient(135deg, #2196F3 0%, #21CBF3 100%)"
        isLoading={loading}
      />
    );
  }

  return (
    <GradientStatCard
      title="Uptime (24 hours)"
      value={formatValue(value, "percentage")}
      gradient="linear-gradient(135deg, #2196F3 0%, #21CBF3 100%)"
      isLoading={loading}
    />
  );
};

export default Uptime24HoursCard;
