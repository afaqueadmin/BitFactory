"use client";

/**
 * Admin dashboard greeting: "Good morning, Qumail" plus a one-line summary of
 * the work queue, with each item linking to its page.
 *
 * The counts reuse the sidebar's badge hooks (same React Query keys), so this
 * adds no requests. The greeting follows the viewer's local clock and is set
 * after mount, so the server render and the first client render match.
 */

import React from "react";
import Link from "next/link";
import { Box, Typography } from "@mui/material";
import { useUser } from "@/lib/hooks";
import { useBadgeCounts } from "@/lib/hooks/useBadgeCounts";
import { focusRing, useDaylight } from "@/lib/daylight";

// 5:00-11:59 morning, 12:00-16:59 afternoon, otherwise evening (no "good
// night": it reads as a goodbye).
function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export default function AdminWelcome() {
  const { d, fonts } = useDaylight();
  const { user } = useUser();
  const { counts, loading } = useBadgeCounts();

  const [greeting, setGreeting] = React.useState<string | null>(null);
  React.useEffect(() => {
    const update = () => setGreeting(greetingFor(new Date().getHours()));
    update();
    // Keep it right if the dashboard stays open across a boundary.
    const id = setInterval(update, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const title = `${greeting ?? "Welcome back"}${firstName ? `, ${firstName}` : ""}`;

  const items = [
    {
      n: counts.tickets,
      label: plural(counts.tickets, "support ticket"),
      href: "/tickets",
    },
    {
      n: counts.hashrateAlerts,
      label: plural(counts.hashrateAlerts, "hashrate alert"),
      href: "/hashrate-alerts",
    },
    {
      n: counts.walletRequests,
      label: plural(counts.walletRequests, "wallet request"),
      href: "/wallets?tab=change-requests",
    },
    {
      n: counts.frequencyRequests,
      label: plural(counts.frequencyRequests, "payment frequency request"),
      href: "/wallets?tab=frequency",
    },
    {
      n: counts.firmwareRequests,
      label: plural(counts.firmwareRequests, "firmware change request"),
      href: "/firmware-change-requests",
    },
    {
      n: counts.loginRequests,
      label: plural(counts.loginRequests, "sign-in email request"),
      href: "/secondary-login-requests",
    },
    {
      n: counts.simulationRequests,
      label: plural(counts.simulationRequests, "simulated account request"),
      href: "/simulated-accounts",
    },
  ].filter((i) => i.n > 0);
  const total = items.reduce((sum, i) => sum + i.n, 0);

  const linkSx = {
    color: d.action,
    fontWeight: 600,
    textDecoration: "none",
    borderRadius: "3px",
    "&:hover": { textDecoration: "underline" },
    "&:focus-visible": focusRing(d.action),
  };

  return (
    <Box>
      <Typography
        component="h1"
        sx={{
          m: 0,
          fontFamily: fonts.heading,
          fontWeight: 750,
          fontSize: { xs: 22, sm: 26 },
          letterSpacing: "-.6px",
          lineHeight: 1.25,
          color: d.text,
        }}
      >
        {title}
      </Typography>
      <Box
        aria-live="polite"
        sx={{ mt: "4px", fontSize: 13, lineHeight: 1.55, color: d.muted }}
      >
        {loading ? (
          "Fleet, customer and finance overview across pools"
        ) : items.length === 0 ? (
          "All clear, nothing needs your attention right now."
        ) : (
          <>
            {items.map((item, i) => (
              <React.Fragment key={item.href}>
                {i > 0 && (i === items.length - 1 ? " and " : ", ")}
                <Box component={Link} href={item.href} sx={linkSx}>
                  {item.label}
                </Box>
              </React.Fragment>
            ))}{" "}
            {total === 1 ? "needs" : "need"} your attention.
          </>
        )}
      </Box>
    </Box>
  );
}
