import GradientStatCard from "@/components/GradientStatCard";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";

const EstimatedMiningDaysLeftCard = ({ days }: { days: number }) => {
  return (
    <GradientStatCard
      title="Estimated mining days left"
      value={`${days} ${days === 1 ? "day" : "days"}`}
      // caption="days"
      gradient="linear-gradient(135deg, #2196F3 0%, #21CBF3 100%)"
      icon={<CalendarTodayIcon fontSize="small" />}
    />
  );
};

export default EstimatedMiningDaysLeftCard;
