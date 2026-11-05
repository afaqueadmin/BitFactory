"use client";

/**
 * Guild page: review a prepared Trezor payout and sign it on the payout
 * Trezor. Every payment, what stays in the guild's account and the fee are
 * listed, with whether each wallet is sealed, when it was approved and
 * whether this guild has paid it before - so a new address stands out. The
 * Trezor then shows the same payments on its own screen; the server checks
 * the signed transaction against the database before it broadcasts it.
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
  txid: string | null;
  guildName: string;
  trezorAccount: number;
  rewardMonth: string;
  psbt: string;
  network: "mainnet" | "testnet";
  fingerprint: string;
  deviceLabel: string | null;
  feeSats: number;
  feeRateSatVb: number;
  changeSats: number;
  changeAddress: string | null;
  outputs: {
    address: string;
    sats: number;
    label: string;
    walletApprovedAt: string | null;
    sealedAt: string | null;
    paidBefore: boolean;
  }[];
  prevTxs: Record<string, string>;
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

export default function TrezorSignDialog({
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
    fetch(`/api/guilds/trezor-payouts?batchId=${batchId}`, {
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
      fetch("/api/guilds/trezor-payouts", {
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
      const client = await import("@/lib/guilds/trezor/trezorClient");
      setStep("Connect and unlock the Trezor, then follow the Trezor window…");
      // The fingerprint check comes first inside; then the device shows
      // each payment and the fee.
      setStep(
        "Check each payment and the fee on the Trezor screen against this list, then confirm there…",
      );
      const signed = await client.signPayoutOnTrezor({
        psbtBase64: data.psbt,
        network: data.network,
        fingerprint: data.fingerprint,
        prevTxs: data.prevTxs,
      });
      setStep("Checking it against the database and sending…");
      const res = await post({
        action: "submit-signatures",
        batchId: data.batchId,
        signatures: signed.signatures,
        fingerprint: signed.fingerprint,
        signerDevice: signed.device,
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to send"));
      return "Signed and broadcast - it settles once it has enough confirmations";
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

  const waiting = data?.status === "AWAITING_SIGNATURE" && !data.txid;

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
              From the guild&apos;s Trezor account {data.trezorAccount} on{" "}
              {data.deviceLabel ?? "the payout Trezor"} ({data.fingerprint}).
              Check each address and amount on the Trezor screen against this
              list. For an address this guild hasn&apos;t paid before, also
              check it against your own record from the Guildmaster&apos;s
              confirmation, or Trezor Suite&apos;s history for paid ones.
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
                {data.outputs.map((o) => (
                  <TableRow key={`${o.address}-${o.label}`}>
                    <TableCell>
                      {o.label}
                      {o.sealedAt && (
                        <CellNote>
                          Sealed {new Date(o.sealedAt).toLocaleString()}
                        </CellNote>
                      )}
                      {o.walletApprovedAt && (
                        <CellNote>
                          Wallet approved{" "}
                          {new Date(o.walletApprovedAt).toLocaleString()}
                        </CellNote>
                      )}
                      {o.paidBefore ? (
                        <CellNote>Paid before by this guild</CellNote>
                      ) : (
                        <Typography
                          sx={{
                            fontSize: 12,
                            color: "warning.main",
                            fontWeight: 600,
                          }}
                        >
                          New address - check it against your own record
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
                ))}
                {data.changeAddress && (
                  <TableRow>
                    <TableCell>
                      Stays in the guild&apos;s account
                      <CellNote>
                        What&apos;s carried, to the guild&apos;s own change
                        address; the Trezor doesn&apos;t show it as a payment
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
                {data.txid
                  ? "It's signed and waiting to be seen on the network - use Check now on the guild page."
                  : "This payout isn't waiting for a signature."}
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
