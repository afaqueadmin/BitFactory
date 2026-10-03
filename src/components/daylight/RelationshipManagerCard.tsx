// src/components/daylight/RelationshipManagerCard.tsx
"use client";

/** "Your Relationship Manager" card with a one-click email link. Renders
 * nothing when the customer has no RM assigned.
 *
 * - `compact`: sidebar / mobile drawer version (single row, small).
 * - default: full card for the Support page. */

import React from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import { RADIUS_CARD, focusRing, useDaylight } from "@/lib/daylight";
import { useRelationshipManager } from "@/lib/hooks/useRelationshipManager";

const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
};

const mailtoHref = (email: string) =>
  `mailto:${email}?subject=${encodeURIComponent("BitFactory enquiry")}`;

export default function RelationshipManagerCard({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { d, fonts } = useDaylight();
  const { rm } = useRelationshipManager();
  if (!rm) return null;

  const avatar = (size: number) => (
    <Box
      aria-hidden
      sx={{
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        bgcolor: d.mint,
        color: d.success,
        fontSize: size > 36 ? 14 : 11,
        fontWeight: 650,
      }}
    >
      {initialsOf(rm.name)}
    </Box>
  );

  if (compact) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          m: "0 4px 8px",
          p: "8px 8px 8px 10px",
          bgcolor: d.canvas,
          border: `1px solid ${d.border}`,
          borderRadius: "10px",
          fontFamily: fonts.body,
          minWidth: 0,
        }}
      >
        {avatar(28)}
        <Box sx={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
          <Box
            sx={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: d.muted,
            }}
          >
            Your RM
          </Box>
          <Box
            title={rm.name}
            sx={{
              fontSize: 12.5,
              fontWeight: 650,
              color: d.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {rm.name}
          </Box>
        </Box>
        {rm.email && (
          <ButtonBase
            component="a"
            href={mailtoHref(rm.email)}
            aria-label={`Email ${rm.name}`}
            title={`Email ${rm.email}`}
            sx={{
              flexShrink: 0,
              width: 30,
              height: 30,
              borderRadius: "8px",
              bgcolor: d.surface,
              border: `1px solid ${d.border}`,
              color: d.action,
              "& > svg": { fontSize: 16 },
              "&:hover": { borderColor: d.action },
              "&:focus-visible": focusRing(d.action),
            }}
          >
            <MailOutlineRoundedIcon />
          </ButtonBase>
        )}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 2,
        mb: { xs: "18px", md: "22px" },
        p: { xs: 2.5, sm: "20px 24px" },
        bgcolor: d.surface,
        border: `1px solid ${d.border}`,
        borderRadius: RADIUS_CARD,
        boxShadow: d.shadow,
        fontFamily: fonts.body,
      }}
    >
      {avatar(44)}
      <Box sx={{ flex: 1, minWidth: 180 }}>
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: d.muted,
          }}
        >
          Your Relationship Manager
        </Typography>
        <Typography
          sx={{
            fontFamily: fonts.heading,
            fontWeight: 700,
            fontSize: 17,
            color: d.text,
            mt: "2px",
          }}
        >
          {rm.name}
        </Typography>
        {rm.email && (
          <Typography
            sx={{ fontSize: 12, color: d.muted, wordBreak: "break-all" }}
          >
            {rm.email}
          </Typography>
        )}
      </Box>
      {rm.email && (
        <ButtonBase
          component="a"
          href={mailtoHref(rm.email)}
          sx={{
            gap: "8px",
            minHeight: 42,
            px: "16px",
            width: { xs: "100%", sm: "auto" },
            borderRadius: "8px",
            fontFamily: fonts.body,
            fontSize: 12,
            fontWeight: 650,
            color: d.action,
            bgcolor: d.skySoft,
            border: `1px solid ${d.borderSky}`,
            "& > svg": { fontSize: 18 },
            "&:hover": { borderColor: d.action },
            "&:focus-visible": focusRing(d.action),
          }}
        >
          <MailOutlineRoundedIcon />
          Email your RM
        </ButtonBase>
      )}
    </Box>
  );
}
