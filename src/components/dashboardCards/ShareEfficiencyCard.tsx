import GradientStatCard from "@/components/GradientStatCard";
import React from "react";
import { formatValue } from "@/lib/helpers/formatValue";

const ShareEfficiencyCard = ({
  value,
  loading,
}: {
  value: number;
  loading: boolean;
}) => (
  <GradientStatCard
    title="Share Efficiency (5 min)"
    value={formatValue(value, "percentage")}
    gradient="linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)"
    isLoading={loading}
  />
);

export default ShareEfficiencyCard;
