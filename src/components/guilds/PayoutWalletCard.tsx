"use client";

/**
 * Guilds page: the 2-of-3 multisig payout wallet. Shown only where multisig
 * payouts are switched on (GUILD_MULTISIG_ENABLED). Steps: create key A (the
 * app's key), add key B (read from the approver's Trezor) and key C (the
 * cold backup), save - then name the approvers.
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

interface WalletKey {
  fingerprint: string;
  originPath: string;
  xpub: string;
  isAppKey?: boolean;
}

interface WalletStatus {
  enabled: boolean;
  network: "mainnet" | "testnet";
  storedNetwork: string;
  appKey: WalletKey | null;
  descriptor: string | null;
  keys: WalletKey[];
  error: string | null;
  guildsOnWallet: number;
  approvers: { id: string; name: string | null; email: string }[];
  admins: { id: string; name: string | null; email: string }[];
  maxFeeRateSatVb: number;
}

const keyPath = (network: "mainnet" | "testnet") =>
  `m/48'/${network === "mainnet" ? 0 : 1}'/0'/2'`;

const keyText = (k: WalletKey) =>
  `[${k.fingerprint}${k.originPath.slice(1)}]${k.xpub}`;

const mono = {
  fontFamily: "monospace",
  fontSize: 12,
  wordBreak: "break-all",
} as const;

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return body.error || fallback;
}

export default function PayoutWalletCard() {
  const ds = useDaylightAdminSx();
  const { withStepUp, stepUpDialog } = useStepUp();
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [keyB, setKeyB] = useState("");
  const [keyC, setKeyC] = useState("");
  const [pasted, setPasted] = useState("");
  const [approvers, setApprovers] = useState<string[]>([]);
  const [feeCap, setFeeCap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/guilds/payout-wallet", {
      credentials: "include",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) {
      setError(body.error || "Failed to load the payout wallet");
      return;
    }
    setStatus(body.data);
    setApprovers(body.data.approvers.map((a: { id: string }) => a.id));
    setFeeCap(String(body.data.maxFeeRateSatVb));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!status || !status.enabled) return null;

  const locked = status.guildsOnWallet > 0;
  const post = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await withStepUp((creds) =>
        fetch("/api/guilds/payout-wallet", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, ...creds }),
        }),
      );
      if (!res.ok)
        throw new Error(await readError(res, "Something went wrong"));
      const data = (await res.json()).data;
      setNotice(
        data?.firstReceiveAddress
          ? `${done}. First guild address: ${data.firstReceiveAddress}`
          : done,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const readFromTrezor = async () => {
    setBusy(true);
    setError(null);
    try {
      const { readTrezorKey } =
        await import("@/lib/guilds/multisig/trezorClient");
      const key = await readTrezorKey({
        network: status.network,
        originPath: keyPath(status.network),
      });
      setKeyB(keyText(key));
      setNotice(`Read key B from the ${key.device}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the Trezor");
    } finally {
      setBusy(false);
    }
  };

  const composed =
    status.appKey && keyB.trim() && keyC.trim()
      ? `wsh(sortedmulti(2,${keyText(status.appKey)}/<0;1>/*,${keyB.trim()}/<0;1>/*,${keyC.trim()}/<0;1>/*))`
      : "";

  return (
    <Paper variant="outlined" sx={{ ...ds.cardSx, p: 2.5, mt: 4 }}>
      <Typography
        component="h2"
        sx={{ fontWeight: 650, fontSize: 16, mb: 0.5 }}
      >
        Multisig payout wallet ({status.network})
      </Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.5 }}>
        A 2-of-3 Bitcoin wallet. Key A is the app&apos;s and signs every payout
        first; key B is the approver&apos;s Trezor, which adds the second
        signature after you check the payments on its screen; key C is the cold
        backup. Each guild gets its own address from it.
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
      {status.error && (
        <Alert severity="warning" sx={{ ...ds.alertSx("warning"), mb: 1.5 }}>
          The saved wallet can&apos;t be read: {status.error}
        </Alert>
      )}
      {locked && (
        <Alert severity="info" sx={{ ...ds.alertSx("info"), mb: 1.5 }}>
          {status.guildsOnWallet} guild(s) use this wallet, so its keys are
          locked. Changing a key means a new wallet.
        </Alert>
      )}

      <Stack spacing={2}>
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
            Key A (the app)
          </Typography>
          {status.appKey ? (
            <Box sx={mono}>{keyText(status.appKey)}</Box>
          ) : (
            <CellNote>Not created yet.</CellNote>
          )}
          {!locked && (
            <Button
              variant="outlined"
              sx={{ ...ds.outlineBtnSx, mt: 1 }}
              disabled={busy}
              onClick={() => {
                if (
                  status.appKey &&
                  !window.confirm(
                    "Replace key A? The saved wallet will be cleared.",
                  )
                )
                  return;
                post({ action: "create-app-key" }, "Key A created");
              }}
            >
              {status.appKey ? "Replace key A" : "Create key A"}
            </Button>
          )}
        </Box>

        {status.descriptor && !status.error ? (
          <Box>
            <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
              Saved wallet
            </Typography>
            <Box sx={mono}>{status.descriptor}</Box>
            <CellNote>
              Keep a copy of this with every key: recovery needs it plus any two
              of the three keys (Sparrow or Caravan can rebuild the wallet).
            </CellNote>
            {status.keys.map((k) => (
              <CellNote key={k.fingerprint}>
                {k.isAppKey ? "Key A (app)" : "Key"} {k.fingerprint} ·{" "}
                {k.originPath}
              </CellNote>
            ))}
          </Box>
        ) : null}

        {status.appKey && !locked && (
          <Box>
            <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1 }}>
              {status.descriptor ? "Change keys B and C" : "Add keys B and C"}
            </Typography>
            <Stack spacing={1.5}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                alignItems={{ sm: "flex-start" }}
              >
                <TextField
                  size="small"
                  fullWidth
                  label="Key B (the approver's Trezor)"
                  placeholder={`[fingerprint${keyPath(status.network).slice(1)}]${status.network === "mainnet" ? "xpub" : "tpub"}…`}
                  value={keyB}
                  onChange={(e) => setKeyB(e.target.value)}
                  sx={ds.inputSx}
                />
                <Button
                  variant="outlined"
                  sx={ds.outlineBtnSx}
                  disabled={busy}
                  onClick={readFromTrezor}
                >
                  Read from Trezor
                </Button>
              </Stack>
              <TextField
                size="small"
                fullWidth
                label="Key C (the cold backup)"
                placeholder={`[fingerprint${keyPath(status.network).slice(1)}]${status.network === "mainnet" ? "xpub" : "tpub"}…`}
                helperText={`Its key at ${keyPath(status.network)}, with its master fingerprint, from the device or wallet that holds it.`}
                value={keyC}
                onChange={(e) => setKeyC(e.target.value)}
                sx={ds.inputSx}
              />
              <TextField
                size="small"
                fullWidth
                multiline
                label="Or paste a full wallet descriptor"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                sx={ds.inputSx}
              />
              <Stack direction="row" justifyContent="flex-end">
                <Button
                  variant="contained"
                  sx={ds.primaryBtnSx}
                  disabled={busy || !(pasted.trim() || composed)}
                  onClick={() =>
                    post(
                      {
                        action: "save-descriptor",
                        descriptor: pasted.trim() || composed,
                      },
                      "Wallet saved",
                    )
                  }
                >
                  Save wallet
                </Button>
              </Stack>
            </Stack>
          </Box>
        )}

        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
            Payout approvers
          </Typography>
          <CellNote>
            Only these admins can prepare, sign or cancel a multisig payout -
            the Trezor holder and a stand-in.
          </CellNote>
          <Stack>
            {status.admins.map((a) => (
              <FormControlLabel
                key={a.id}
                control={
                  <Checkbox
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
