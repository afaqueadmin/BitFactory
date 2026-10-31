"use client";

/**
 * Guild page: review a prepared multisig payout and add the second
 * signature - the approver's Trezor (or, on testnet, the software stand-in).
 * Every payment, the change that stays in the wallet and the fee are listed,
 * with when each member's wallet was approved, so a brand-new address stands
 * out. The Trezor then shows the same payments on its own screen.
 */

import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { CellNote, useDaylightAdminSx } from "@/components/daylight/AdminPage";
import type { StepUpCredentials } from "@/components/StepUpDialog";
import { formatBtc, formatMonth } from "@/lib/guilds/format";

interface SigningData {
  batchId: string;
  status: string;
  guildName: string;
  rewardMonth: string;
  psbt: string;
  network: "mainnet" | "testnet";
  feeSats: number;
  feeRateSatVb: number;
  changeSats: number;
  changeAddress: string | null;
  outputs: {
    address: string;
    sats: number;
    label: string;
    walletApprovedAt: string | null;
  }[];
  keys: {
    fingerprint: string;
    originPath: string;
    xpub: string;
    isAppKey: boolean;
  }[];
  signedByAppKey: boolean;
  prevTxs: Record<string, string>;
  testSignerAvailable: boolean;
}

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const mono = {
  fontFamily: "monospace",
  fontSize: 12,
  wordBreak: "break-all",
} as const;

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return body.error || fallback;
}

export default function MultisigSignDialog({
  batchId,
  onClose,
  onDone,
  withStepUp,
}: {
  batchId: string | null;
  onClose: () => void;
  /** After signing or cancelling: the message to show, then reload. */
  onDone: (message: string) => void;
  withStepUp: (
    send: (creds: StepUpCredentials) => Promise<Response>,
  ) => Promise<Response>;
}) {
  const ds = useDaylightAdminSx();
  const [data, setData] = useState<SigningData | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    if (!batchId) return;
    fetch(`/api/guilds/multisig-payouts?batchId=${batchId}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok)
          throw new Error(await readError(res, "Failed to load the payout"));
        setData((await res.json()).data);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load"),
      );
  }, [batchId]);

  const post = (body: Record<string, unknown>) =>
    withStepUp((creds) =>
      fetch("/api/guilds/multisig-payouts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ...creds }),
      }),
    );

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      setStep(null);
    }
  };

  const signWithTrezor = () =>
    run(async () => {
      if (!data) throw new Error("Not loaded");
      const client = await import("@/lib/guilds/multisig/trezorClient");
      setStep("Connect and unlock the Trezor, then follow the Trezor window…");
      // Which of the wallet's keys this Trezor holds.
      const originPath = data.keys[0].originPath;
      const device = await client.readTrezorKey({
        network: data.network,
        originPath,
      });
      const mine = data.keys.find(
        (k) =>
          !k.isAppKey &&
          k.fingerprint === device.fingerprint &&
          k.xpub === device.xpub,
      );
      if (!mine) {
        throw new Error(
          `This Trezor (${device.fingerprint}) holds none of the wallet's approver keys`,
        );
      }
      setStep(
        "Check each payment and the fee on the Trezor screen, then confirm there…",
      );
      const { signedPsbt } = await client.signPayoutOnTrezor({
        psbtBase64: data.psbt,
        network: data.network,
        keys: data.keys,
        approverFingerprint: mine.fingerprint,
        prevTxs: data.prevTxs,
      });
      setStep("Sending…");
      const res = await post({
        action: "submit-signature",
        batchId: data.batchId,
        signedPsbt,
        signerDevice: device.device,
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to send"));
      return "Signed and broadcast - it settles once it has enough confirmations";
    });

  const signWithTestSigner = () =>
    run(async () => {
      const res = await post({ action: "sign-test", batchId });
      if (!res.ok) throw new Error(await readError(res, "Failed to sign"));
      return "Signed with the testnet software signer and broadcast";
    });

  const cancel = () =>
    run(async () => {
      if (
        !window.confirm("Cancel this prepared payout? Nothing has been sent.")
      ) {
        throw new Error("Not cancelled");
      }
      const res = await post({ action: "cancel", batchId });
      if (!res.ok) throw new Error(await readError(res, "Failed to cancel"));
      return "Payout cancelled - the month is ready to prepare again";
    });

  const waiting = data?.status === "AWAITING_SIGNATURE";

  return (
    <Dialog
      open={!!batchId}
      onClose={busy ? undefined : onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        {data
          ? `${data.guildName}: ${formatMonth(data.rewardMonth)} payout`
          : "Guild payout"}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ ...ds.alertSx("error"), mb: 1.5 }}>
            {error}
          </Alert>
        )}
        {step && (
          <Alert severity="info" sx={{ ...ds.alertSx("info"), mb: 1.5 }}>
            {step}
          </Alert>
        )}
        {!data && !error && <Typography>Loading…</Typography>}
        {data && (
          <>
            {data.network === "testnet" && (
              <Alert
                severity="warning"
                sx={{ ...ds.alertSx("warning"), mb: 1.5 }}
              >
                Testnet: these coins have no value.
              </Alert>
            )}
            <Typography sx={{ fontSize: 13, mb: 1 }}>
              {data.signedByAppKey ? "Signed by the app key (A). " : ""}
              Check each address and amount on the Trezor screen against this
              list and against your own record of the members&apos; approved
              wallets. A wallet approved in the last 7 days is marked.
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Pays</TableCell>
                  <TableCell>Address</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.outputs.map((o) => {
                  const recent =
                    o.walletApprovedAt &&
                    Date.now() - new Date(o.walletApprovedAt).getTime() <
                      RECENT_MS;
                  return (
                    <TableRow key={`${o.address}-${o.label}`}>
                      <TableCell>
                        {o.label}
                        {o.walletApprovedAt && (
                          <CellNote>
                            Wallet approved{" "}
                            {new Date(o.walletApprovedAt).toLocaleString()}
                          </CellNote>
                        )}
                        {recent && (
                          <Typography
                            sx={{
                              fontSize: 12,
                              color: "warning.main",
                              fontWeight: 600,
                            }}
                          >
                            New wallet - check it with the Guildmaster
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Box sx={mono}>{o.address}</Box>
                      </TableCell>
                      <TableCell align="right">
                        <strong>{formatBtc(o.sats / 1e8)}</strong>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {data.changeAddress && (
                  <TableRow>
                    <TableCell>
                      Stays in the guild wallet
                      <CellNote>
                        What&apos;s carried; the Trezor doesn&apos;t show it as
                        a payment
                      </CellNote>
                    </TableCell>
                    <TableCell>
                      <Box sx={mono}>{data.changeAddress}</Box>
                    </TableCell>
                    <TableCell align="right">
                      {formatBtc(data.changeSats / 1e8)}
                    </TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell>Network fee</TableCell>
                  <TableCell>{data.feeRateSatVb} sat/vB</TableCell>
                  <TableCell align="right">
                    {formatBtc(data.feeSats / 1e8)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            {!waiting && (
              <Alert severity="info" sx={{ ...ds.alertSx("info"), mt: 1.5 }}>
                This payout isn&apos;t waiting for a signature.
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Close
        </Button>
        {waiting && (
          <>
            <Button
              sx={ds.dangerOutlineBtnSx}
              variant="outlined"
              onClick={cancel}
              disabled={busy}
            >
              Cancel payout
            </Button>
            {data?.testSignerAvailable && (
              <Button
                variant="outlined"
                sx={ds.outlineBtnSx}
                onClick={signWithTestSigner}
                disabled={busy}
              >
                Sign with test signer
              </Button>
            )}
            <Button
              variant="contained"
              sx={ds.successBtnSx}
              onClick={signWithTrezor}
              disabled={busy}
            >
              Sign with Trezor
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
