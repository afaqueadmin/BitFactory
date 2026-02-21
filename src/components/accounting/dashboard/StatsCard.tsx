/**
 * Stats Card Component
 *
 * Reusable card for displaying accounting statistics
 */

import {
  Card,
  CardContent,
  Box,
  Typography,
  CircularProgress,
} from "@mui/material";
import { CurrencyDisplay } from "../common/CurrencyDisplay";

interface StatsCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  loading?: boolean;
  color?: "primary" | "success" | "warning" | "error" | "info";
  isCurrency?: boolean;
}

export function StatsCard({
  label,
  value,
  subtext,
  loading = false,
  color = "primary",
  isCurrency = false,
}: StatsCardProps) {
  const colorMap = {
    primary: "#3B82F6",
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    info: "#06B6D4",
  };

  return (
    <Card
      sx={{
        background: `linear-gradient(135deg, ${colorMap[color]}15 0%, ${colorMap[color]}05 100%)`,
        borderLeft: `4px solid ${colorMap[color]}`,
        height: "100%",
      }}
    >
      <CardContent>
        <Typography
          color="textSecondary"
          gutterBottom
          sx={{ fontSize: "0.875rem" }}
        >
          {label}
        </Typography>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mt: 1,
          }}
        >
          {loading ? (
            <CircularProgress size={32} />
          ) : (
            <>
              {isCurrency ? (
                <CurrencyDisplay
                  value={typeof value === "number" ? value : 0}
                  variant="h5"
                  fontWeight="bold"
                  standalone={true}
                />
              ) : (
                <Typography variant="h5" sx={{ fontWeight: "bold" }}>
                  {value}
                </Typography>
              )}
            </>
          )}
        </Box>

        {subtext && (
          <Typography
            sx={{ fontSize: "0.75rem", color: "textSecondary", mt: 1 }}
          >
            {subtext}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
