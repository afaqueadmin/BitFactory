"use client";

/**
 * Admin-only render of a customer's wallet overview, exactly as the customer
 * sees the top of their /wallet page (down to the P&L chart), minus the
 * interactive controls and under a branded heading. Puppeteer prints this
 * page to the PDF that's emailed to the customer.
 *
 * Query: `name` (customer name for the heading) and, for the payout email,
 * `payoutDate` (YYYY-MM-DD, UTC) to list that day's payout transactions.
 *
 * Sets body[data-snapshot-ready="true"] once every figure has loaded - the
 * PDF renderer waits for it.
 */

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Box, Typography } from "@mui/material";
import WalletOverview from "@/components/wallet/WalletOverview";
import WalletSnapshotHeading from "@/components/wallet/WalletSnapshotHeading";
import WalletSnapshotTransactions from "@/components/wallet/WalletSnapshotTransactions";
import { useDaylight } from "@/lib/daylight";

// Desktop layout width the snapshot is laid out at (and the PDF scales from).
const SNAPSHOT_WIDTH = 1200;

const LIVE_WALLET_URL = "https://my.bitfactory.ae/wallet";

function WalletSnapshot() {
  const { customerId } = useParams<{ customerId: string }>();
  const searchParams = useSearchParams();
  const customerName = searchParams.get("name");
  const payoutDateParam = searchParams.get("payoutDate");
  const payoutDate =
    payoutDateParam && /^\d{4}-\d{2}-\d{2}$/.test(payoutDateParam)
      ? payoutDateParam
      : null;

  const { d, fonts } = useDaylight();
  const [generatedAt] = useState(() => new Date());
  const [overviewReady, setOverviewReady] = useState(false);
  const [transactionsReady, setTransactionsReady] = useState(!payoutDate);

  const handleOverviewReady = useCallback(() => setOverviewReady(true), []);
  const handleTransactionsLoaded = useCallback(
    () => setTransactionsReady(true),
    [],
  );

  useEffect(() => {
    if (overviewReady && transactionsReady) {
      document.body.dataset.snapshotReady = "true";
    }
  }, [overviewReady, transactionsReady]);

  return (
    <Box sx={{ backgroundColor: d.canvas, minHeight: "100vh" }}>
      <Box
        sx={{
          width: SNAPSHOT_WIDTH,
          mx: "auto",
          p: "32px 36px",
          fontFamily: fonts.body,
          color: d.text,
          // Never cut a card, the chart or a table row across a PDF page.
          "& .MuiPaper-root, & .snapshot-block, & tr": {
            breakInside: "avoid",
          },
        }}
      >
        <WalletOverview
          customerId={customerId}
          subaccountsParam="all"
          snapshot
          onReady={handleOverviewReady}
          heading={
            <WalletSnapshotHeading
              customerName={customerName}
              generatedAt={generatedAt}
            />
          }
        />
        {payoutDate && (
          <WalletSnapshotTransactions
            customerId={customerId}
            payoutDate={payoutDate}
            onLoaded={handleTransactionsLoaded}
          />
        )}
        <Typography
          className="snapshot-block"
          sx={{
            mt: "22px",
            pt: "14px",
            borderTop: `1px solid ${d.border}`,
            fontSize: 11,
            lineHeight: 1.6,
            color: d.muted,
          }}
        >
          View your live wallet at any time:{" "}
          <a href={LIVE_WALLET_URL} style={{ color: d.action }}>
            {LIVE_WALLET_URL.replace("https://", "")}
          </a>
        </Typography>
      </Box>
    </Box>
  );
}

export default function WalletSnapshotPage() {
  return (
    <Suspense>
      <WalletSnapshot />
    </Suspense>
  );
}
