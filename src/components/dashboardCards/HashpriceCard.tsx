import GradientStatCard from "@/components/GradientStatCard";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import { formatValue } from "@/lib/helpers/formatValue";

const HashpriceCard = ({
  value,
  loading,
  poolMode = "total",
}: {
  value: number;
  loading: boolean;
  poolMode?: "total" | "luxor" | "braiins";
}) => {
  // Hashprice is not available from Braiins API
  if (poolMode === "braiins" && !loading) {
    return (
      <GradientStatCard
        title="Hashprice"
        value="ℹ️ Not available"
        caption="Braiins pool API does not provide hashprice data"
        gradient="linear-gradient(135deg, #FFB300 0%, #FFCA28 100%)"
        isLoading={loading}
      />
    );
  }

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
