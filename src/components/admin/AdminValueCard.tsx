"use client";

import React from "react";
import { Card, CardContent, Typography, Box } from "@mui/material";
import { formatValue } from "@/lib/helpers/formatValue";

interface AdminValueCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  type?: "currency" | "number";
}

export default function AdminValueCard({
  title,
  value,
  subtitle,
  type = "number",
}: AdminValueCardProps) {
  const formattedValue = formatValue(value, type);

  return (
    <Card
      sx={{
        height: "100%",
        background: (theme) =>
          theme.palette.mode === "dark"
            ? "linear-gradient(145deg, rgba(40,40,40,0.9), rgba(30,30,30,0.9))"
            : "linear-gradient(145deg, rgba(255,255,255,0.9), rgba(250,250,250,0.9))",
        backdropFilter: "blur(10px)",
        border: (theme) => `1px solid ${theme.palette.divider}`,
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.08)",
        borderRadius: 2,
        transition: "transform 0.2s, box-shadow 0.2s",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.12)",
        },
      }}
    >
      <CardContent>
        <Typography
          variant="h6"
          color="textSecondary"
          sx={{
            mb: 1,
            fontWeight: 500,
          }}
        >
          {title}
        </Typography>
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
