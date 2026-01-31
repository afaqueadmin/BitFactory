import GradientStatCard from "@/components/GradientStatCard";
import React from "react";
import { formatValue } from "@/lib/helpers/formatValue";

const Uptime24HoursCard = ({
  value,
  loading,
}: {
  value: number;
  loading: boolean;
}) => (
  <GradientStatCard
    title="Uptime (24 hours)"
    value={formatValue(value, "percentage")}
    gradient="linear-gradient(135deg, #2196F3 0%, #21CBF3 100%)"
    isLoading={loading}
  />
);

export default Uptime24HoursCard;
