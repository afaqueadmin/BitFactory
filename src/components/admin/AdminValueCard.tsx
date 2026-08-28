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
        minHeight: { xs: 130, sm: 145, md: 155 },
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: (theme) =>
          theme.palette.mode === "dark"
            ? "linear-gradient(145deg, rgba(35,35,38,0.95), rgba(25,25,28,0.95))"
            : "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(248,249,250,0.98))",
        backdropFilter: "blur(10px)",
        border: (theme) => `1px solid ${theme.palette.divider}`,
        borderLeft: borderColor ? `6px solid ${borderColor}` : "none",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
        borderRadius: 2.5,
        transition: "transform 0.2s, box-shadow 0.2s",
        cursor: onClick ? "pointer" : "default",
        "&:hover": {
          transform: "translateY(-3px)",
          boxShadow: "0 10px 28px rgba(0, 0, 0, 0.12)",
        },
      }}
    >
      <CardContent
        sx={{
          p: { xs: 2.25, sm: 2.75, md: 3 },
          "&:last-child": { pb: { xs: 2.25, sm: 2.75, md: 3 } },
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 0.75,
            mb: 1.5,
          }}
        >
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              fontWeight: 600,
              fontSize: { xs: "0.88rem", sm: "0.95rem", md: "1.025rem" },
              lineHeight: 1.35,
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
                sx={{ p: 0.25, color: "text.secondary", flexShrink: 0 }}
                aria-label={`How ${title} is calculated`}
              >
                <InfoOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "baseline",
            gap: 1,
            flexWrap: "wrap",
            mt: "auto",
          }}
        >
          {subtitle && (
            <Typography
              variant="h5"
              color="primary"
              sx={{
                fontWeight: 700,
                fontSize: { xs: "1.1rem", sm: "1.3rem", md: "1.5rem" },
              }}
            >
              {subtitle}
            </Typography>
          )}
          <Typography
            variant="h4"
            color="primary"
            sx={{
              fontWeight: 800,
              fontSize: { xs: "1.45rem", sm: "1.75rem", md: "2.05rem" },
              lineHeight: 1.15,
              wordBreak: "break-word",
              letterSpacing: "-0.02em",
            }}
          >
            {formattedValue}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
