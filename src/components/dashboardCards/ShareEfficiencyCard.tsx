import GradientStatCard from "@/components/GradientStatCard";
import React from "react";
import { formatValue } from "@/lib/helpers/formatValue";

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
        gradient="linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)"
        isLoading={loading}
      />
    );
  }

  return (
    <GradientStatCard
      title="Share Efficiency (5 min)"
      value={formatValue(value, "percentage")}
      gradient="linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)"
      isLoading={loading}
    />
  );
};

export default ShareEfficiencyCard;
