"use client";

/**
 * Admin-only render of a customer's wallet overview, exactly as the customer
 * sees the top of their /wallet page (down to the P&L chart), minus the
 * interactive controls. Puppeteer prints this page to the PDF that's emailed
 * to the customer, and the compose page shows it in an iframe as a preview.
 *
 * Sets body[data-snapshot-ready="true"] once every figure has loaded - the
 * PDF renderer waits for it.
 */

import React, { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { Box, Typography } from "@mui/material";
import WalletOverview from "@/components/wallet/WalletOverview";
import { useDaylight } from "@/lib/daylight";

// Desktop layout width the snapshot is laid out at (and the PDF scales from).
const SNAPSHOT_WIDTH = 1200;

export default function WalletSnapshotPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { d, fonts } = useDaylight();
  const [generatedAt] = useState(() => new Date());

  const handleReady = useCallback(() => {
    document.body.dataset.snapshotReady = "true";
  }, []);

  return (
    <Box sx={{ backgroundColor: d.canvas, minHeight: "100vh" }}>
      <Box
        sx={{
          width: SNAPSHOT_WIDTH,
          mx: "auto",
          p: "32px 36px",
          fontFamily: fonts.body,
          color: d.text,
        }}
      >
        <WalletOverview
          customerId={customerId}
          subaccountsParam="all"
          snapshot
          onReady={handleReady}
        />
        <Typography
          sx={{ mt: "18px", fontSize: 11, color: d.muted, textAlign: "right" }}
        >
          Snapshot as of{" "}
          {generatedAt.toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Dubai",
          })}{" "}
          (GST)
        </Typography>
      </Box>
    </Box>
  );
}
