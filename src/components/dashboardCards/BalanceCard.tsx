import GradientStatCard from "@/components/GradientStatCard";
import React from "react";
import { formatValue } from "@/lib/helpers/formatValue";

const BalanceCard = ({ value }: { value: number }) => (
  <GradientStatCard
    title="Balance"
    value={formatValue(value, "currency")}
    // caption="yesterday"
    gradient="linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)"
    // icon={<AttachMoneyIcon fontSize="small" />}
  />
);

export default BalanceCard;
