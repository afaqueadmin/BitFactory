"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Paper, Tab, Tabs, Typography, Box } from "@mui/material";
import {
  DaylightAdminPage,
  DaylightLoading,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import VerifiedIcon from "@mui/icons-material/Verified";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import StatCard from "@/components/daylight/StatCard";
import CurrentWalletsTab, {
  type WalletRow,
  walletState,
} from "@/components/wallets/CurrentWalletsTab";
import MismatchAlertsTab from "@/components/wallets/MismatchAlertsTab";
import WalletChangeRequestsPanel from "@/components/wallets/WalletChangeRequestsPanel";
import PaymentFrequencyRequestsPanel from "@/components/wallets/PaymentFrequencyRequestsPanel";
import GuildRequestsPanel from "@/components/guilds/GuildRequestsPanel";

const PATH = "/wallets";
const TABS = [
  "current",
  "mismatches",
  "change-requests",
  "guild",
  "frequency",
] as const;
type TabKey = (typeof TABS)[number];

interface Counts {
  openMismatches: number;
  noRecord: number;
  pendingChangeRequests: number;
  pendingFrequencyRequests: number;
  pendingGuildWalletRequests: number;
}

const DESCRIPTIONS: Record<TabKey, string> = {
  current:
    "The payout address we expect Luxor to hold for each client subaccount. It changes only through an approved change request or an accepted Luxor address. Luxor is checked against it every day.",
  mismatches:
    "Subaccounts where Luxor's payout address differs from our record, including a change you just approved but haven't made on Luxor yet. Correct Luxor and choose “Luxor has been updated”, or accept Luxor's address after confirming with the client.",
  "change-requests":
    "Client requests to change their Luxor payout address. Confirm with the client (call or email) first, then approve. Approving updates our record, but not Luxor: update the payout address on Luxor yourself, then close the mismatch alert.",
  guild:
    "Guildmasters' requests to change a member's reward wallet. Confirm with the Guildmaster first, then approve; the member's next share waits out a 24-hour freeze.",
  frequency:
    "Client requests to change the payout schedule on a Luxor subaccount. Confirm with the client first, then approve. Approving does not update Luxor: change the payment frequency there yourself.",
};

export default function WalletsPage() {
  return (
    <Suspense fallback={null}>
      <WalletsContent />
    </Suspense>
  );
}

function WalletsContent() {
  const ds = useDaylightAdminSx();
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: TabKey = (TABS as readonly string[]).includes(raw ?? "")
    ? (raw as TabKey)
    : "current";

  const [rows, setRows] = useState<WalletRow[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/wallets", { credentials: "include" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load wallets");
      setRows(body.data);
      setCounts(body.counts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load wallets");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const go = (v: TabKey) =>
    router.replace(v === "current" ? PATH : `${PATH}?tab=${v}`, {
      scroll: false,
    });

  const matching = rows
    ? rows.filter((r) => walletState(r) === "match").length
    : "—";
  const pendingRequests = counts
    ? counts.pendingChangeRequests +
      counts.pendingGuildWalletRequests +
      counts.pendingFrequencyRequests
    : "—";

  const withCount = (label: string, n: number | undefined) =>
    n ? `${label} (${n})` : label;

  return (
    <DaylightAdminPage>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={ds.pageTitleSx}>
          Wallets
        </Typography>
        <Typography sx={ds.pageDescSx}>{DESCRIPTIONS[tab]}</Typography>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(210px, 100%), 1fr))",
          gap: { xs: "12px", sm: "16px" },
          mb: { xs: "20px", md: "24px" },
        }}
      >
        <StatCard
          title="Subaccounts tracked"
          value={rows ? rows.length : "—"}
          caption={
            rows
              ? `${rows.filter((r) => r.address).length} with a payout address`
              : undefined
          }
          tone="sky"
          icon={<AccountBalanceWalletIcon />}
          isLoading={!rows}
        />
        <StatCard
          title="Matching Luxor"
          value={matching}
          caption={rows ? `of ${rows.length} at the last check` : undefined}
          tone="mint"
          icon={<VerifiedIcon />}
          isLoading={!rows}
        />
        <Box
          component="button"
          type="button"
          onClick={() => go("mismatches")}
          aria-label="Open mismatch alerts"
          sx={{
            all: "unset",
            display: "flex",
            alignItems: "stretch",
            alignSelf: "stretch",
            minWidth: 0,
            // Stretch the card to the wrapper (and so the grid row) rather than
            // using its own height: 100%, so it matches the other stat cards.
            "& > [role=article]": { flex: 1, minWidth: 0, height: "auto" },
            cursor: "pointer",
            borderRadius: "16px",
            "&:focus-visible": { outline: "2px solid", outlineOffset: 2 },
          }}
        >
          <StatCard
            title="Open mismatches"
            value={counts ? counts.openMismatches : "—"}
            caption={
              counts?.openMismatches
                ? "Luxor differs from our record"
                : "Luxor matches everywhere"
            }
            tone={counts?.openMismatches ? "danger" : "mint"}
            icon={<ReportProblemIcon />}
            isLoading={!counts}
          />
        </Box>
        <StatCard
          title="Requests to review"
          value={pendingRequests}
          caption="Wallet, guild wallet and schedule"
          tone="amber"
          icon={<PendingActionsIcon />}
          isLoading={!counts}
        />
      </Box>
      {counts && counts.noRecord > 0 && tab === "current" && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {counts.noRecord} subaccount(s) have no wallet record yet because
          Luxor couldn&apos;t be read for them. Re-run
          scripts/wallet-initial-sync.js once Luxor answers for them.
        </Alert>
      )}
      <Paper elevation={0} sx={{ ...ds.listCardSx, p: { xs: 2, sm: 3 } }}>
        <Tabs
          value={tab}
          onChange={(_, v: TabKey) => go(v)}
          sx={{ ...ds.tabsSx, mb: 3 }}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab
            value="current"
            label={
              rows ? `Current Wallets (${rows.length})` : "Current Wallets"
            }
          />
          <Tab
            value="mismatches"
            label={withCount("Mismatch Alerts", counts?.openMismatches)}
          />
          <Tab
            value="change-requests"
            label={withCount(
              "Wallet Change Requests",
              counts?.pendingChangeRequests,
            )}
          />
          <Tab
            value="guild"
            label={withCount(
              "Guild Wallet Requests",
              counts?.pendingGuildWalletRequests,
            )}
          />
          <Tab
            value="frequency"
            label={withCount(
              "Payment Frequency Requests",
              counts?.pendingFrequencyRequests,
            )}
          />
        </Tabs>

        {tab === "current" &&
          (rows ? (
            <CurrentWalletsTab
              rows={rows}
              onChanged={load}
              onOpenMismatches={() => go("mismatches")}
            />
          ) : (
            <DaylightLoading />
          ))}
        {tab === "mismatches" && <MismatchAlertsTab onChanged={load} />}
        {tab === "change-requests" && <WalletChangeRequestsPanel embedded />}
        {tab === "guild" && <GuildRequestsPanel kinds={["wallet"]} embedded />}
        {tab === "frequency" && <PaymentFrequencyRequestsPanel embedded />}
      </Paper>
    </DaylightAdminPage>
  );
}
