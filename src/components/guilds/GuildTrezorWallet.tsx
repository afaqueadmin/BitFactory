"use client";

/**
 * Guild page, Payout section, where Trezor payouts are switched on:
 *
 *  - not set up yet: Set up Trezor wallet - the Trezor shows the guild
 *    account's receiving address on its screen; confirm it, then set it as
 *    the Luxor payout address.
 *  - set up: the receiving address, which Suite account it is, what the
 *    account holds, Show on Trezor, and the wallet seals - every wallet the
 *    guild's payouts can go to must be sealed by the payout Trezor.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { CellNote, useDaylightAdminSx } from "@/components/daylight/AdminPage";
import type { StepUpCredentials } from "@/components/StepUpDialog";
import { formatBtc } from "@/lib/guilds/format";
import { payoutTxUrl } from "@/lib/guilds/walletNetworks";

export interface GuildTrezorInfo {
  enabled: boolean;
  network: "mainnet" | "testnet";
  coinType: number;
  walletNetwork: string;
  deviceConnected: boolean;
  fingerprint: string | null;
  coins: {
    txid: string;
    vout: number;
    sats: number;
    branch: number;
    index: number;
    source: string;
    status: string;
  }[];
  unexpectedSpends: {
    txid: string;
    vout: number;
    sats: number;
    updatedAt: string;
  }[];
}

interface SealTarget {
  key: string;
  holder: string;
  address: string;
  sealed: boolean;
  sealedAt: string | null;
  message: string | null;
}

interface WalletData {
  enabled: boolean;
  next: {
    network: "mainnet" | "testnet";
    coinType: number;
    account: number;
    path: string;
    fingerprint: string;
  } | null;
  seals: {
    network: "mainnet" | "testnet";
    coinType: number;
    sealPath: string;
    sealAddress: string;
    targets: SealTarget[];
  } | null;
  problem: string | null;
}

const mono = {
  fontFamily: "monospace",
  fontSize: 12,
  wordBreak: "break-all",
} as const;

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return body.error || fallback;
}

export default function GuildTrezorWallet({
  guildId,
  guildName,
  trezorAccount,
  payoutAddress,
  trezor,
  withStepUp,
  onDone,
}: {
  guildId: string;
  guildName: string;
  trezorAccount: number | null;
  payoutAddress: string | null;
  trezor: GuildTrezorInfo;
  withStepUp: (
    send: (creds: StepUpCredentials) => Promise<Response>,
  ) => Promise<Response>;
  /** After a change: the message to show, then reload the guild. */
  onDone: (message: string) => void;
}) {
  const ds = useDaylightAdminSx();
  const [data, setData] = useState<WalletData | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/guilds/${guildId}/trezor-wallet`, {
      credentials: "include",
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.success) setData(body.data);
    else if (res.status !== 403) {
      setMessage({
        ok: false,
        text: body.error || "Failed to load the Trezor wallet",
      });
    }
  }, [guildId]);

  useEffect(() => {
    load();
  }, [load, trezorAccount, payoutAddress]);

  if (!trezor.enabled || !data?.enabled) return null;

  const post = (body: Record<string, unknown>) =>
    withStepUp((creds) =>
      fetch(`/api/guilds/${guildId}/trezor-wallet`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ...creds }),
      }),
    );

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      const done = await fn();
      if (done) {
        await load();
        onDone(done);
      }
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof Error ? e.message : "Something went wrong",
      });
    } finally {
      setBusy(false);
      setStep(null);
    }
  };

  const setUp = () =>
    run(async () => {
      const next = data.next;
      if (!next) throw new Error(data.problem ?? "Not ready to set up");
      const client = await import("@/lib/guilds/trezor/trezorClient");
      setStep(
        "Connect and unlock the Trezor, then follow the Trezor window. Check the address on the Trezor screen and confirm it there…",
      );
      const read = await client.readGuildAccount({
        network: next.network,
        coinType: next.coinType,
        account: next.account,
        fingerprint: next.fingerprint,
      });
      setStep("Saving…");
      const res = await post({
        action: "set-up",
        account: next.account,
        xpub: read.xpub,
        fingerprint: read.fingerprint,
        shownAddress: read.shownAddress,
        deviceLabel: read.label,
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to set up"));
      return `Trezor wallet set up: account ${next.account}, receiving address ${read.shownAddress}. Set it as the Luxor payout address, then seal the wallets`;
    });

  const showOnTrezor = () =>
    run(async () => {
      if (trezorAccount === null || !trezor.fingerprint) return null;
      const client = await import("@/lib/guilds/trezor/trezorClient");
      setStep("Check the address on the Trezor screen…");
      const shown = await client.showGuildAddress({
        network: trezor.network,
        coinType: trezor.coinType,
        account: trezorAccount,
        fingerprint: trezor.fingerprint,
      });
      setMessage(
        shown === payoutAddress
          ? { ok: true, text: `The Trezor derived the same address: ${shown}` }
          : {
              ok: false,
              text: `The Trezor derived a DIFFERENT address: ${shown}. Don't use ${payoutAddress} - tell the developer.`,
            },
      );
      return null;
    });

  const refresh = () =>
    run(async () => {
      const res = await fetch(`/api/guilds/${guildId}/trezor-wallet`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to check"));
      const r = (await res.json()).data as {
        seen: number;
        available: number;
        unconfirmed: number;
        vanished: number;
      };
      return r.vanished > 0
        ? `Checked: ${r.vanished} coin(s) left the account without a payout from the app - admins have been emailed`
        : `Checked: ${r.seen} coin(s) in the account, ${r.available} available, ${r.unconfirmed} confirming`;
    });

  const unsealed = data.seals?.targets.filter((t) => !t.sealed) ?? [];

  const seal = () =>
    run(async () => {
      const seals = data.seals;
      if (!seals || !trezor.fingerprint || unsealed.length === 0) return null;
      const client = await import("@/lib/guilds/trezor/trezorClient");
      setStep(
        `The Trezor shows each wallet (${unsealed.length}). Check the address against what the Guildmaster confirmed, then confirm on the Trezor…`,
      );
      const signatures = await client.signSeals({
        network: seals.network,
        sealPath: seals.sealPath,
        sealAddress: seals.sealAddress,
        fingerprint: trezor.fingerprint,
        messages: unsealed.map((t) => t.message!),
        onProgress: (done) =>
          setStep(
            `Sealed ${done} of ${unsealed.length} on the Trezor - confirm the next one there…`,
          ),
      });
      setStep("Saving…");
      const res = await post({
        action: "seal",
        seals: unsealed.map((t, i) => ({
          key: t.key,
          message: t.message,
          signature: signatures[i],
        })),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to save"));
      return `${unsealed.length} wallet(s) sealed with the payout Trezor`;
    });

  const alerts = (
    <>
      {message && (
        <Alert
          severity={message.ok ? "success" : "error"}
          sx={{ ...ds.alertSx(message.ok ? "success" : "error"), mb: 1 }}
          onClose={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}
      {step && (
        <Alert severity="info" sx={{ ...ds.alertSx("info"), mb: 1 }}>
          {step}
        </Alert>
      )}
    </>
  );

  // ---- not set up yet ----
  if (trezorAccount === null) {
    return (
      <Box sx={{ mt: 1.5 }}>
        {alerts}
        <Alert severity="info" sx={ds.alertSx("info")}>
          Trezor payouts ({trezor.network}) are switched on.{" "}
          {data.next ? (
            <>
              Set up gives {guildName} its own account on the payout Trezor
              (account {data.next.account}, {data.next.path}). The Trezor shows
              the guild&apos;s receiving address on its screen; confirm it
              there, then set it as the Luxor payout address. Every distribution
              must be sent first.{" "}
              <Button
                size="small"
                variant="outlined"
                sx={ds.outlineBtnSx}
                disabled={busy}
                onClick={setUp}
              >
                Set up Trezor wallet
              </Button>
            </>
          ) : (
            (data.problem ?? "The payout Trezor isn't ready.")
          )}
        </Alert>
      </Box>
    );
  }

  // ---- set up ----
  const sum = (filter: (c: GuildTrezorInfo["coins"][number]) => boolean) =>
    trezor.coins.filter(filter).reduce((s, c) => s + c.sats, 0) / 1e8;

  return (
    <Box>
      <Typography component="h2" sx={{ fontWeight: 650, fontSize: 16, mb: 1 }}>
        Payout: Trezor wallet ({trezor.network})
      </Typography>
      {alerts}
      {trezor.unexpectedSpends.length > 0 && (
        <Alert severity="error" sx={{ ...ds.alertSx("error"), mb: 1 }}>
          {trezor.unexpectedSpends.length} coin(s) left this guild&apos;s Trezor
          account without a payout from the app (
          {formatBtc(
            trezor.unexpectedSpends.reduce((s, c) => s + c.sats, 0) / 1e8,
          )}
          ). If nobody sent them from Trezor Suite on purpose, stop payouts and
          investigate.
          {trezor.unexpectedSpends.map((c) => {
            const url = payoutTxUrl(c.txid, trezor.walletNetwork);
            return (
              <CellNote key={`${c.txid}:${c.vout}`}>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {c.txid.slice(0, 12)}…:{c.vout}
                  </a>
                ) : (
                  `${c.txid}:${c.vout}`
                )}{" "}
                · {formatBtc(c.sats / 1e8)}
              </CellNote>
            );
          })}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ ...ds.cardSx, p: 2 }}>
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            fontSize: 13,
          }}
        >
          <Box>
            Receiving address (set it on Luxor)
            <Box sx={mono}>{payoutAddress}</Box>
            <CellNote>
              Luxor pays the monthly reward here. Trezor Suite shows it as
              Bitcoin{trezor.network === "testnet" ? " Testnet" : ""} Native
              SegWit account #{trezorAccount + 1} (account {trezorAccount},
              m/84&apos;/{trezor.coinType}&apos;/{trezorAccount}&apos;).
            </CellNote>
          </Box>
          <Box>
            In the account
            <CellNote>
              {formatBtc(sum((c) => c.status === "AVAILABLE"))} available
              {sum((c) => c.status === "UNCONFIRMED") > 0 &&
                ` · ${formatBtc(sum((c) => c.status === "UNCONFIRMED"))} confirming`}
              {sum((c) => c.status === "RESERVED") > 0 &&
                ` · ${formatBtc(sum((c) => c.status === "RESERVED"))} in a prepared payout`}
            </CellNote>
            <CellNote>
              Of which carried for members (change):{" "}
              {formatBtc(
                sum((c) => c.source === "CHANGE" && c.status !== "SPENT"),
              )}
            </CellNote>
          </Box>
          <Box>
            <Button
              size="small"
              variant="outlined"
              sx={ds.outlineBtnSx}
              disabled={busy}
              onClick={showOnTrezor}
            >
              Show on Trezor
            </Button>{" "}
            <Button
              size="small"
              variant="outlined"
              sx={ds.outlineBtnSx}
              disabled={busy}
              onClick={refresh}
            >
              Refresh from the chain
            </Button>
            <CellNote>
              Show on Trezor: the Trezor works out the receiving address itself
              and shows it on its screen. Refresh: checks the account on the
              chain now.
            </CellNote>
          </Box>
        </Box>
      </Paper>

      {data.seals && (
        <Box sx={{ mt: 1.5 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ sm: "center" }}
            spacing={1}
            sx={{ mb: 1 }}
          >
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
                Wallet seals
              </Typography>
              <CellNote>
                Payouts only go to wallets the payout Trezor has sealed. Seal a
                wallet after checking its address on the Trezor screen against
                what the Guildmaster confirmed.
              </CellNote>
            </Box>
            <Button
              variant="contained"
              sx={ds.primaryBtnSx}
              disabled={busy || unsealed.length === 0}
              onClick={seal}
            >
              {unsealed.length > 0
                ? `Seal ${unsealed.length} wallet(s) with Trezor`
                : "All wallets sealed"}
            </Button>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>For</TableCell>
                <TableCell>Wallet</TableCell>
                <TableCell>Seal</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.seals.targets.map((t) => (
                <TableRow key={t.key}>
                  <TableCell>{t.holder}</TableCell>
                  <TableCell>
                    <Box sx={mono}>{t.address}</Box>
                  </TableCell>
                  <TableCell>
                    {t.sealed ? (
                      <Typography
                        sx={{ fontSize: 12.5, color: "success.main" }}
                      >
                        Sealed
                        {t.sealedAt &&
                          ` ${new Date(t.sealedAt).toLocaleString()}`}
                      </Typography>
                    ) : (
                      <Typography
                        sx={{
                          fontSize: 12.5,
                          color: "warning.main",
                          fontWeight: 600,
                        }}
                      >
                        Not sealed
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
      {data.problem && (
        <Alert severity="warning" sx={{ ...ds.alertSx("warning"), mt: 1 }}>
          {data.problem}
        </Alert>
      )}
    </Box>
  );
}
