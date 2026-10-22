"use client";

/**
 * Branded heading of the emailed wallet snapshot PDF (and the compose page's
 * preview of it): BitFactory logo, document title, customer and the time the
 * figures were taken. Takes the place of WalletOverview's "Wallet" title.
 */

import React from "react";
import Image from "next/image";
import { Box, Typography } from "@mui/material";
import { useDaylight } from "@/lib/daylight";

// Pakistan Standard Time, labelled "(GMT+5)" like the Next Payout card.
const SNAPSHOT_TIME_ZONE = "Asia/Karachi";

export const formatSnapshotTimestamp = (date: Date): string => {
  const offset =
    new Intl.DateTimeFormat("en-US", {
      timeZone: SNAPSHOT_TIME_ZONE,
      timeZoneName: "shortOffset",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value || "GMT+5";
  return `${date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: SNAPSHOT_TIME_ZONE,
  })} (${offset})`;
};

export default function WalletSnapshotHeading({
  customerName,
  generatedAt,
}: {
  customerName: string | null;
  generatedAt: Date;
}) {
  const { d, fonts } = useDaylight();

  return (
    <Box
      sx={{ display: "flex", alignItems: "center", gap: "22px", minWidth: 0 }}
    >
      <Image
        src="/BitfactoryLogo.webp"
        alt="BitFactory"
        width={150}
        height={75}
        priority
        style={{ height: "auto" }}
      />
      <Box
        sx={{ minWidth: 0, pl: "22px", borderLeft: `1px solid ${d.border}` }}
      >
        <Typography
          component="h1"
          sx={{
            fontFamily: fonts.heading,
            fontWeight: 750,
            fontSize: 28,
            lineHeight: 1.25,
            letterSpacing: "-.035em",
            color: d.text,
          }}
        >
          Wallet Summary
        </Typography>
        {customerName && (
          <Typography
            sx={{ fontSize: 15, fontWeight: 600, color: d.text, mt: "4px" }}
          >
            {customerName}
          </Typography>
        )}
        <Typography sx={{ fontSize: 12, color: d.muted, mt: "4px" }}>
          As of {formatSnapshotTimestamp(generatedAt)}
        </Typography>
      </Box>
    </Box>
  );
}
