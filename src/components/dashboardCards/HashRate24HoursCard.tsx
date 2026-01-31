import GradientStatCard from "@/components/GradientStatCard";
import { formatValue } from "@/lib/helpers/formatValue";

const HashRate24HoursCard = ({
  value,
  loading,
}: {
  value: number;
  loading: boolean;
}) => {
  return (
    <GradientStatCard
      title="Hashrate (24 hours)"
      value={formatValue(value / 1000000000000000, "number", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      })}
      tag="PH/s"
      gradient="linear-gradient(135deg, #00BFA6 0%, #1DE9B6 100%)"
      isLoading={loading}
    />
  );
};

export default HashRate24HoursCard;
