import GradientStatCard from "@/components/GradientStatCard";
import { formatHashrate } from "@/lib/workerNormalization";

/**
 * Built from the hashrate line colours in HashrateHistoryChart so the card
 * always matches the line currently on screen: Luxor blue (#1565C0) and
 * Braiins orange (#FFA500). "total" follows Luxor, which is the colour the
 * combined view leads with.
 */
const HASHRATE_GRADIENTS = {
  total: "linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)",
  luxor: "linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)",
  braiins: "linear-gradient(135deg, #FFA500 0%, #E07C00 100%)",
} as const;

const HashRate24HoursCard = ({
  value,
  loading,
  poolMode = "total",
}: {
  value: number;
  loading: boolean;
  poolMode?: "total" | "luxor" | "braiins";
}) => {
  // value is in H/s, use formatHashrate to display as TH/s or PH/s intelligently
  const displayValue = formatHashrate(value);

  return (
    <GradientStatCard
      title="Hashrate (24 hours)"
      value={displayValue}
      gradient={HASHRATE_GRADIENTS[poolMode]}
      isLoading={loading}
    />
  );
};

export default HashRate24HoursCard;
