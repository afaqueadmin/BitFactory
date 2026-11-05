"use client";

/**
 * Guilds page: the payout Trezor. Shown only where Trezor payouts are
 * switched on (GUILD_TREZOR_ENABLED). Each guild gets its own single-key
 * account on this device; the app builds payouts and the Trezor alone signs.
 *
 * Connect payout Trezor reads the device's public keys (nothing is signed),
 * finds the accounts already in use and proposes where guild accounts
 * start. Then name the approvers and set the fee cap.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { CellNote, useDaylightAdminSx } from "@/components/daylight/AdminPage";
import { useStepUp } from "@/components/StepUpDialog";
import type { ReadTrezor } from "@/lib/guilds/trezor/device";

type Person = { id: string; name: string | null; email: string };

interface TrezorStatus {
  enabled: boolean;
  network: "mainnet" | "testnet";
  coinType: number;
  maxGuildAccount: number;
  device: {
    fingerprint: string;
    label: string | null;
    network: string | null;
    connectedAt: string | null;
    connectedBy: { name: string | null; email: string } | null;
    sealAddress: string | null;
  } | null;
  networkMismatch: boolean;
  nextTrezorAccount: number;
  guildsOnTrezor: number;
  approvers: Person[];
  admins: Person[];
  maxFeeRateSatVb: number;
}

interface Inspection {
  used: number[];
  firstUnused: number;
  proposed: number;
}

/** Accounts read on the first try; more only if they're all in use. */
const FIRST_READ = 10;

const mono = {
  fontFamily: "monospace",
  fontSize: 12,
  wordBreak: "break-all",
} as const;

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return body.error || fallback;
}

/** Suite numbers accounts from 1: account 0 is "#1". */
const suiteName = (account: number) => `#${account + 1}`;

export default function PayoutTrezorCard() {
  const ds = useDaylightAdminSx();
  const { withStepUp, stepUpDialog } = useStepUp();
  const [status, setStatus] = useState<TrezorStatus | null>(null);
  const [read, setRead] = useState<ReadTrezor | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [startAt, setStartAt] = useState("");
  const [approvers, setApprovers] = useState<string[]>([]);
  const [feeCap, setFeeCap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/guilds/payout-trezor", {
      credentials: "include",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) {
      // Accounting staff can't see it; say nothing.
      if (res.status !== 403) {
        setError(body.error || "Failed to load the payout Trezor");
      }
      return;
    }
    setStatus(body.data);
    setApprovers(body.data.approvers.map((a: Person) => a.id));
    setFeeCap(String(body.data.maxFeeRateSatVb));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!status || !status.enabled) return null;

  const post = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await withStepUp((creds) =>
        fetch("/api/guilds/payout-trezor", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, ...creds }),
        }),
      );
      if (!res.ok)
        throw new Error(await readError(res, "Something went wrong"));
      setNotice(done);
      setRead(null);
      setInspection(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const readTrezor = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setRead(null);
    setInspection(null);
    try {
      const { readPayoutTrezor } =
        await import("@/lib/guilds/trezor/trezorClient");
      let count = FIRST_READ;
      for (;;) {
        const r = await readPayoutTrezor({
          network: status.network,
          coinType: status.coinType,
          count,
        });
        const res = await fetch("/api/guilds/payout-trezor", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "inspect", read: r }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.success) {
          setRead(r);
          setInspection(body.data);
          setStartAt(String(body.data.proposed));
          return;
        }
        const message: string = body.error || "Couldn't check the accounts";
        if (/read more/.test(message) && count < status.maxGuildAccount) {
          count = Math.min(count + 20, status.maxGuildAccount);
          continue;
        }
        throw new Error(message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the Trezor");
    } finally {
      setBusy(false);
    }
  };

  const device = status.device;
  const reconnecting = !!device && status.guildsOnTrezor > 0;

  return (
    <Paper variant="outlined" sx={{ ...ds.cardSx, p: 2.5, mt: 4 }}>
      <Typography
        component="h2"
        sx={{ fontWeight: 650, fontSize: 16, mb: 0.5 }}
      >
        Payout Trezor ({status.network})
      </Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.5 }}>
        Each guild gets its own Bitcoin account on this Trezor, which Trezor
        Suite shows with its balance and transactions. The app works out each
        payout and builds it; the Trezor alone signs it, after you check every
        payment on its screen. The app holds no keys.
      </Typography>
      {error && (
        <Alert
          severity="error"
          sx={{ ...ds.alertSx("error"), mb: 1.5 }}
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}
      {notice && (
        <Alert
          severity="success"
          sx={{ ...ds.alertSx("success"), mb: 1.5 }}
          onClose={() => setNotice(null)}
        >
          {notice}
        </Alert>
      )}
      {status.networkMismatch && (
        <Alert severity="warning" sx={{ ...ds.alertSx("warning"), mb: 1.5 }}>
          The Trezor was connected for {device?.network}, but this site pays out
          on {status.network}. Connect it again.
        </Alert>
      )}

      <Stack spacing={2}>
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: 14 }}>Device</Typography>
          {device ? (
            <>
              <CellNote>
                {device.label ?? "Trezor"} · fingerprint {device.fingerprint}
                {device.connectedAt &&
                  ` · connected ${new Date(device.connectedAt).toLocaleString()}`}
                {device.connectedBy &&
                  ` by ${device.connectedBy.name || device.connectedBy.email}`}
              </CellNote>
              <CellNote>
                Next guild gets account {status.nextTrezorAccount} (Suite&apos;s
                Native SegWit {suiteName(status.nextTrezorAccount)}).{" "}
                {status.guildsOnTrezor} guild(s) have an account on it.
              </CellNote>
              {device.sealAddress && (
                <CellNote>
                  Seal key (signs approved wallets, never holds funds):{" "}
                  <Box component="span" sx={mono}>
                    {device.sealAddress}
                  </Box>
                </CellNote>
              )}
            </>
          ) : (
            <CellNote>Not connected yet.</CellNote>
          )}
          {reconnecting && (
            <CellNote>
              Guilds already have accounts on it, so only this same device can
              be connected again (for example after a firmware update).
            </CellNote>
          )}
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              variant="outlined"
              sx={ds.outlineBtnSx}
              disabled={busy}
              onClick={readTrezor}
            >
              {device ? "Connect again" : "Connect payout Trezor"}
            </Button>
          </Stack>
          <CellNote>
            Plug in the Trezor and unlock it (standard wallet, no passphrase).
            Close Trezor Suite and allow pop-ups. Only public keys are read.
          </CellNote>

          {read && inspection && (
            <Box
              sx={{
                mt: 1.5,
                p: 1.5,
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
              }}
            >
              <Typography sx={{ fontSize: 13.5 }}>
                Read {read.label}, fingerprint {read.fingerprint}.
              </Typography>
              <Typography sx={{ fontSize: 13.5 }}>
                {inspection.used.length === 0
                  ? `No ${status.network} Native SegWit account on it has a transaction yet.`
                  : `Accounts ${inspection.used.join(", ")} (Suite's ${inspection.used
                      .map(suiteName)
                      .join(
                        ", ",
                      )}) have transactions, so guilds can't use them.`}
              </Typography>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                alignItems={{ sm: "center" }}
                sx={{ mt: 1.5 }}
              >
                <TextField
                  id="trezor-start-account"
                  size="small"
                  type="number"
                  label="Guild accounts start at"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  inputProps={{
                    min: inspection.proposed,
                    max: status.maxGuildAccount,
                  }}
                  helperText={`From ${inspection.proposed} to ${status.maxGuildAccount}. Trezor Suite only shows an account once every account before it has a transaction.`}
                  sx={ds.inputSx}
                />
                <Button
                  variant="contained"
                  sx={ds.primaryBtnSx}
                  disabled={busy}
                  onClick={() =>
                    post(
                      {
                        action: "connect",
                        read,
                        nextTrezorAccount: Number(startAt),
                      },
                      `Payout Trezor connected; the next guild gets account ${startAt}`,
                    )
                  }
                >
                  Save
                </Button>
              </Stack>
            </Box>
          )}
        </Box>

        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
            Payout approvers
          </Typography>
          <CellNote>
            Only these admins can prepare, sign or cancel a Trezor payout and
            seal wallets - the Trezor holder and a stand-in.
          </CellNote>
          <Stack>
            {status.admins.map((a) => (
              <FormControlLabel
                key={a.id}
                control={
                  <Checkbox
                    id={`approver-${a.id}`}
                    size="small"
                    checked={approvers.includes(a.id)}
                    onChange={(e) =>
                      setApprovers(
                        e.target.checked
                          ? [...approvers, a.id]
                          : approvers.filter((x) => x !== a.id),
                      )
                    }
                  />
                }
                label={
                  <Typography sx={{ fontSize: 13 }}>
                    {a.name || a.email} · {a.email}
                  </Typography>
                }
              />
            ))}
          </Stack>
          <Stack direction="row" justifyContent="flex-end">
            <Button
              variant="outlined"
              sx={ds.outlineBtnSx}
              disabled={busy}
              onClick={() =>
                post(
                  { action: "set-approvers", userIds: approvers },
                  "Approvers saved",
                )
              }
            >
              Save approvers
            </Button>
          </Stack>
        </Box>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ sm: "center" }}
        >
          <TextField
            id="trezor-fee-cap"
            size="small"
            type="number"
            label="Fee rate cap (sat/vB)"
            value={feeCap}
            onChange={(e) => setFeeCap(e.target.value)}
            helperText="Payouts use mempool.space's half-hour estimate, never more than this."
            sx={ds.inputSx}
          />
          <Button
            variant="outlined"
            sx={ds.outlineBtnSx}
            disabled={busy}
            onClick={() =>
              post(
                { action: "set-max-fee", maxFeeRateSatVb: Number(feeCap) },
                "Fee cap saved",
              )
            }
          >
            Save cap
          </Button>
        </Stack>
      </Stack>
      {stepUpDialog}
    </Paper>
  );
}
