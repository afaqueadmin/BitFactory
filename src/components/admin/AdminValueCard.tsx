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
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { formatValue } from "@/lib/helpers/formatValue";
import { RADIUS_CARD, focusRing, useDaylight } from "@/lib/daylight";

interface AdminValueCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  type?: "currency" | "BTC" | "number";
  onClick?: () => void;
  borderColor?: string; // Color for left border (e.g., "#757575" for DB, "#1565C0" for Luxor, etc.)
  infoText?: React.ReactNode; // Shown in a tooltip explaining how the value is calculated
  /** Daylight styling (admin dashboard). `borderColor` becomes a small
   * data-source marker next to the title instead of a thick left border. */
  daylight?: boolean;
}

export default function AdminValueCard({
  title,
  value,
  subtitle,
  type = "number",
  onClick,
  borderColor,
  infoText,
  daylight = false,
}: AdminValueCardProps) {
  const { d, fonts } = useDaylight();
  const formattedValue = formatValue(value, type);

  if (daylight) {
    return (
      <Box
        role={onClick ? "button" : "article"}
        aria-label={title}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        sx={{
          position: "relative",
          minWidth: 0,
          height: "100%",
          minHeight: { xs: 108, md: 120 },
          display: "flex",
          flexDirection: "column",
          bgcolor: d.surface,
          border: `1px solid ${d.border}`,
          borderRadius: RADIUS_CARD,
          boxShadow: d.shadow,
          p: { xs: "16px", sm: "20px" },
          fontFamily: fonts.body,
          cursor: onClick ? "pointer" : "default",
          transition: "border-color .15s",
          ...(onClick && {
            "&:hover": {
              borderColor: d.action,
              "& .value-card-arrow": { color: d.action },
            },
            "&:focus-visible": focusRing(d.action),
          }),
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
            fontSize: { xs: 13, md: 14 },
            lineHeight: 1.4,
            color: d.muted,
          }}
        >
          {borderColor && (
            <Box
              aria-hidden
              sx={{
                width: 8,
                height: 8,
                mt: "0.4em",
                borderRadius: "2px",
                bgcolor: borderColor,
                flexShrink: 0,
              }}
            />
          )}
          <Box component="span" sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}>
            {title}
          </Box>
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
                sx={{
                  p: "2px",
                  mt: "-2px",
                  color: d.muted,
                  flexShrink: 0,
                  "&:hover": { bgcolor: d.hover, color: d.action },
                }}
                aria-label={`How ${title} is calculated`}
              >
                <InfoOutlinedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 1,
            mt: "auto",
            pt: "12px",
          }}
        >
          <Typography
            component="p"
            sx={{
              m: 0,
              fontFamily: fonts.heading,
              fontWeight: 750,
              fontSize: { xs: 22, sm: 24, lg: 26 },
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              color: d.text,
              fontVariantNumeric: "tabular-nums",
              overflowWrap: "anywhere",
            }}
          >
            {formattedValue}
            {subtitle && (
              <Box
                component="span"
                sx={{
                  fontFamily: fonts.body,
                  fontWeight: 600,
                  fontSize: { xs: 13, md: 14 },
                  letterSpacing: 0,
                  ml: "5px",
                  color: d.muted,
                }}
              >
                {subtitle}
              </Box>
            )}
          </Typography>
          {onClick && (
            <ArrowForwardRoundedIcon
              className="value-card-arrow"
              aria-hidden
              sx={{
                fontSize: 18,
                mb: "6px",
                color: d.muted,
                flexShrink: 0,
                transition: "color .15s",
              }}
            />
          )}
        </Box>
      </Box>
    );
  }

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
