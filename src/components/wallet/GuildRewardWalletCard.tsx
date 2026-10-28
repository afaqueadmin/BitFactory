"use client";

/**
 * Wallet page card for guild accounts. Luxor pays a guild's reward to a
 * Higgs wallet, so the Luxor payout address and schedule mean nothing to the
 * guild's members; what matters is the reward wallet saved for them here.
 * Members only ever see their own wallet.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Box, CircularProgress, Paper, Typography } from "@mui/material";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

interface GuildWallet {
  guild: { name: string };
  isGuildmaster: boolean;
  myWallet: { address: string | null; updatedAt: string | null };
}

export default function GuildRewardWalletCard() {
  const { d, fonts } = useDaylight();
  const [data, setData] = useState<GuildWallet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/guild", { credentials: "include" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load");
        if (!cancelled) setData(body.data);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Paper
      sx={{
        gridColumn: { sm: "span 2" },
        p: { xs: 2, sm: 2.5 },
        borderRadius: RADIUS_CARD,
        background: d.skySoft,
        border: `1px solid ${d.borderSky}`,
        boxShadow: d.shadow,
        fontFamily: fonts.body,
        color: d.text,
      }}
    >
      <Typography
        sx={{
          fontSize: "0.8rem",
          fontWeight: 600,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color: d.action,
        }}
      >
        Your reward wallet
      </Typography>
      {!data && !error ? (
        <CircularProgress size={18} sx={{ mt: 1, color: d.action }} />
      ) : error ? (
        <Typography sx={{ mt: 1, fontSize: 13, color: d.danger }}>
          {error}
        </Typography>
      ) : (
        data && (
          <>
            <Box
              sx={{
                mt: 1,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: 14,
                wordBreak: "break-all",
              }}
            >
              {data.myWallet.address ?? "Not set yet"}
            </Box>
            <Typography sx={{ mt: 1, fontSize: 12.5, color: d.muted }}>
              {data.guild.name}&apos;s reward is paid once a month. After the
              guild&apos;s hosting is paid, your share is sent to this wallet.{" "}
              {data.isGuildmaster
                ? "You can request wallet changes for any member on the "
                : "Your Guildmaster can request a change. See the "}
              <Link href="/guild">Guild page</Link>.
            </Typography>
          </>
        )
      )}
    </Paper>
  );
}
