import GradientStatCard from "@/components/GradientStatCard";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import { formatValue } from "@/lib/helpers/formatValue";

const HashpriceCard = ({
  value,
  loading,
}: {
  value: number;
  loading: boolean;
}) => {
  return (
    <GradientStatCard
      title="Hashprice"
      value={formatValue(value, "BTC", {
        minimumFractionDigits: 5,
        maximumFractionDigits: 5,
      })}
      tag="BTC/PH/s/Day"
      gradient="linear-gradient(135deg, #FFB300 0%, #FFCA28 100%)"
      icon={<ShowChartIcon fontSize="small" />}
      isLoading={loading}
    />
  );
};

export default HashpriceCard;
