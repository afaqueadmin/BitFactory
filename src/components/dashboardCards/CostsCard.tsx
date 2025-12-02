import GradientStatCard from "@/components/GradientStatCard";
import { formatValue } from "@/lib/helpers/formatValue";

const CostsCard = ({ value }: { value: number }) => {
  return (
    <GradientStatCard
      title="Daily cost"
      value={formatValue(value, "currency")}
      // caption="yesterday"
      gradient="linear-gradient(135deg, #00BFA6 0%, #1DE9B6 100%)"
      // icon={<AttachMoneyIcon fontSize="small" />}
    />
  );
};

export default CostsCard;
