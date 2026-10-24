// src/components/GradientStatCard.tsx
"use client";

/**
 * GradientStatCard
 *
 * Reusable gradient information card used in dashboard 4-up row.
 *
 * Props:
 * - title: string
 * - value: string | number
 * - caption?: string
 * - tag?: string
 * - gradient?: string (CSS gradient)
 * - icon?: ReactNode (optional small icon)
 *
 * Design:
 * - Uses specified gradient; in dark mode we add a subtle overlay to improve contrast.
 * - Text is white for readability on gradients.
 * - Inside a themed admin page (`useDaylightScope()`) it renders the Daylight
 *   StatCard instead; the gradient only picks the soft tone.
 */

import React from "react";
import {
  Box,
  Typography,
  useTheme,
  SvgIcon,
  CircularProgress,
} from "@mui/material";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import StatCard, { type StatCardTone } from "@/components/daylight/StatCard";
import { useDaylightScope } from "@/components/daylight/AdminPage";

// Warm (amber/orange/pink) and green gradients keep their hue family as a
// Daylight tone; everything else (blues, purples) maps to sky.
function toneForGradient(gradient?: string): StatCardTone {
  if (!gradient) return "sky";
  if (
    /#(FFB300|FFCA28|FF9800|FFA726|f093fb|f5576c|fa709a|fee140)/i.test(gradient)
  )
    return "amber";
  if (/#(00BFA6|1DE9B6|4CAF50|43e97b|38f9d7|11998e|38ef7d)/i.test(gradient))
    return "mint";
  return "sky";
}

export interface GradientStatCardProps {
  title: string;
  value: string | number;
  isLoading?: boolean;
  caption?: string;
  tag?: string;
  gradient?: string;
  icon?: React.ReactNode;
}

export default function GradientStatCard({
  title,
  value,
  caption,
  tag,
  gradient,
  icon,
  isLoading = false,
}: GradientStatCardProps) {
  const theme = useTheme();
  const daylight = useDaylightScope();

  if (daylight) {
    return (
      <StatCard
        title={title}
        value={value}
        unit={tag}
        caption={caption}
        tone={toneForGradient(gradient)}
        icon={icon ?? <InsightsOutlinedIcon />}
        isLoading={isLoading}
      />
    );
  }

  // default gradient if none provided
  const baseGradient =
    gradient ?? "linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)";

  // apply slight dark overlay in dark mode to improve text contrast
  const overlay =
    theme.palette.mode === "dark"
      ? "linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.2)),"
      : "";

  return (
    <Box
      role="article"
      aria-label={title}
      sx={{
        borderRadius: 2,
        overflow: "hidden",
        boxShadow: "0px 6px 18px rgba(2,6,23,0.06)",
        color: "#fff",
        p: { xs: 1.5, sm: 2 },
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        gap: { xs: 1, sm: 1.5 },
        background: `${overlay} ${baseGradient}`,
      }}
    >
      {/* Title */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {icon && (
          <SvgIcon
            sx={{
              color: "rgba(255,255,255,0.9)",
              fontSize: { xs: 18, sm: 20 },
            }}
          >
            {icon}
          </SvgIcon>
        )}
        <Typography
          variant="subtitle2"
          sx={{
            opacity: 0.95,
            fontSize: { xs: "0.75rem", sm: "0.8rem" },
            lineHeight: 1.3,
          }}
        >
          {title}
        </Typography>
      </Box>
      {isLoading ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CircularProgress size={24} sx={{ color: "white" }} />
          <Typography variant="body2">Loading...</Typography>
        </Box>
      ) : (
        <div>
          <Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                fontSize: { xs: "1.1rem", sm: "1.3rem", md: "1.5rem" },
              }}
            >
              {value} {tag && <span>{tag}</span>}
            </Typography>
          </Box>

          {/* Caption */}
          {caption && (
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {caption}
            </Typography>
          )}
        </div>
      )}
    </Box>
  );
}
