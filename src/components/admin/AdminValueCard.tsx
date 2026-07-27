"use client";

import React from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  Tooltip,
  IconButton,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { formatValue } from "@/lib/helpers/formatValue";

interface AdminValueCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  type?: "currency" | "BTC" | "number";
  onClick?: () => void;
  borderColor?: string; // Color for left border (e.g., "#757575" for DB, "#1565C0" for Luxor, etc.)
  infoText?: React.ReactNode; // Shown in a tooltip explaining how the value is calculated
}

export default function AdminValueCard({
  title,
  value,
  subtitle,
  type = "number",
  onClick,
  borderColor,
  infoText,
}: AdminValueCardProps) {
  const formattedValue = formatValue(value, type);

  return (
    <Card
      onClick={onClick}
      sx={{
        height: "100%",
        background: (theme) =>
          theme.palette.mode === "dark"
            ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
            : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
        backdropFilter: "blur(10px)",
        border: (theme) => `1px solid ${theme.palette.divider}`,
        borderLeft: borderColor ? `6px solid ${borderColor}` : "none",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.08)",
        borderRadius: 2,
        transition: "transform 0.2s, box-shadow 0.2s",
        cursor: onClick ? "pointer" : "default",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.12)",
        },
      }}
    >
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
          <Typography
            variant="h6"
            color="textSecondary"
            sx={{
              fontWeight: 500,
            }}
          >
            {title}
          </Typography>
          {infoText && (
            <Tooltip
              title={infoText}
              arrow
              enterTouchDelay={0}
              leaveTouchDelay={5000}
            >
              <IconButton
                size="small"
                onClick={(e) => e.stopPropagation()}
                sx={{ p: 0.25, color: "text.secondary" }}
                aria-label={`How ${title} is calculated`}
              >
                <InfoOutlinedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          {subtitle && (
            <Typography variant="h4" color="primary" sx={{ fontWeight: 600 }}>
              {subtitle}
            </Typography>
          )}
          <Typography
            variant="h4"
            color="primary"
            sx={{
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            {formattedValue}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
