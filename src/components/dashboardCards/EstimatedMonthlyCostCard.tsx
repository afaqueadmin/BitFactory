import GradientStatCard from "@/components/GradientStatCard";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import { formatValue } from "@/lib/helpers/formatValue";

const EstimatedMonthlyCostCard = ({ value }: { value: number }) => {
  return (
    <GradientStatCard
      title="Estimate monthly cost"
      value={formatValue(value, "currency")}
      // caption="month"
      gradient="linear-gradient(135deg, #FFB300 0%, #FFCA28 100%)"
      icon={<ShowChartIcon fontSize="small" />}
    />
  );
};

export default EstimatedMonthlyCostCard;
