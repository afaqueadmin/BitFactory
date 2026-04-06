import GradientStatCard from "@/components/GradientStatCard";
import { formatHashrate } from "@/lib/workerNormalization";

const HashRate24HoursCard = ({
  value,
  loading,
}: {
  value: number;
  loading: boolean;
}) => {
  // value is in H/s, use formatHashrate to display as TH/s or PH/s intelligently
  const displayValue = formatHashrate(value);

  return (
    <GradientStatCard
      title="Hashrate (24 hours)"
      value={displayValue}
      gradient="linear-gradient(135deg, #00BFA6 0%, #1DE9B6 100%)"
      isLoading={loading}
    />
  );
};

export default HashRate24HoursCard;
