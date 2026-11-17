"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import {
  CellNote,
  DaylightEmptyState,
  DaylightLoading,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import { useStepUp, type StepUpCredentials } from "@/components/StepUpDialog";
import NoteActionDialog from "@/components/wallets/NoteActionDialog";
import WalletHistoryDialog from "@/components/wallets/WalletHistoryDialog";
import {
  MISMATCH_STATUS,
  fmtDateTime,
  monoSx,
  personLabel,
} from "@/components/wallets/walletLabels";

interface Mismatch {
  id: string;
  status: string;
  poolSubaccountId: string;
  subaccountName: string;
  customer: { id: string; name: string | null; email: string } | null;
  expectedAddress: string | null;
  currentRecord: string | null;
  luxorAddress: string | null;
  detectedAt: string;
  lastSeenAt: string;
  emailedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: { name: string | null; email: string } | null;
  resolutionNote: string | null;
}

type Action = "fixed" | "accept" | "recheck";

const ACTION_COPY: Record<
  Action,
  { title: string; confirm: string; description: string }
> = {
  fixed: {
    title: "Luxor has been updated",
    confirm: "Re-check and close",
    description:
      "Use this after correcting the payout address on Luxor by hand. Luxor is read again now; the alert closes only if Luxor matches our record.",
  },
  accept: {
    title: "Accept Luxor's address",
    confirm: "Accept Luxor's address",
    description:
      "Luxor's current address becomes our record for this subaccount, and the old one moves to history. Only do this after confirming with the client. You'll be asked for your password or 2FA code.",
  },
  recheck: {
    title: "Re-check against Luxor",
    confirm: "Re-check now",
    description:
      "Reads Luxor now and updates this alert with what it holds. It doesn't close the alert.",
  },
};

/** Subaccounts where Luxor's payout address differs from our record. */
export default function MismatchAlertsTab({
  onChanged,
}: {
  onChanged: () => void;
}) {
  const ds = useDaylightAdminSx();
  const { withStepUp, stepUpDialog } = useStepUp();
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState<Mismatch[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [target, setTarget] = useState<{ m: Mismatch; action: Action } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/wallets/mismatches${showAll ? "?status=ALL" : ""}`,
        { credentials: "include" },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load mismatches");
      setRows(body.data);
      setLoadError(null);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Failed to load mismatches",
      );
    }
  }, [showAll]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (note: string) => {
    if (!target) return;
    const { m, action } = target;
    setBusy(true);
    setError(null);
    try {
      const send = (creds: StepUpCredentials = {}) =>
        fetch(
          action === "recheck"
            ? `/api/wallets/${m.poolSubaccountId}/recheck`
            : `/api/wallets/mismatches/${m.id}/${action}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ note, ...creds }),
          },
        );
      const res = action === "accept" ? await withStepUp(send) : await send();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Action failed");
      setNotice(
        action === "recheck"
          ? `${m.subaccountName} re-checked`
          : body.message || "Done",
      );
      setTarget(null);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack direction="row" sx={{ mb: 2 }}>
        <FormControlLabel
          control={
            <Switch
              id="mismatches-show-all"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
          }
          label="Show resolved too"
        />
      </Stack>
      {notice && (
        <Alert
          severity="success"
          onClose={() => setNotice(null)}
          sx={{ mb: 2 }}
        >
          {notice}
        </Alert>
      )}
      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}
      {!rows ? (
        <DaylightLoading />
      ) : rows.length === 0 ? (
        <DaylightEmptyState>
          {showAll
            ? "No mismatches have ever been found."
            : "Every checked subaccount matches Luxor."}
        </DaylightEmptyState>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={ds.tableCardSx}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Customer / subaccount</TableCell>
                <TableCell>Our record</TableCell>
                <TableCell>Luxor has</TableCell>
                <TableCell>Detected</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id} hover>
                  <TableCell>
                    {personLabel(m.customer)}
                    <CellNote>{m.subaccountName}</CellNote>
                  </TableCell>
                  <TableCell sx={{ "&&&": { minWidth: 220, maxWidth: 300 } }}>
                    <Box sx={monoSx}>{m.currentRecord ?? "(none)"}</Box>
                  </TableCell>
                  <TableCell sx={{ "&&&": { minWidth: 220, maxWidth: 300 } }}>
                    <Box sx={monoSx}>{m.luxorAddress ?? "(no address)"}</Box>
                  </TableCell>
                  <TableCell>
                    {fmtDateTime(m.detectedAt)}
                    <CellNote>Last seen {fmtDateTime(m.lastSeenAt)}</CellNote>
                    {m.emailedAt && (
                      <CellNote>Emailed {fmtDateTime(m.emailedAt)}</CellNote>
                    )}
                  </TableCell>
                  <TableCell>
                    <DaylightStatusPill
                      label={MISMATCH_STATUS[m.status]?.label ?? m.status}
                      tone={MISMATCH_STATUS[m.status]?.tone ?? "neutral"}
                    />
                    {m.resolvedAt && (
                      <CellNote>
                        {fmtDateTime(m.resolvedAt)} by{" "}
                        {personLabel(m.resolvedBy)}
                      </CellNote>
                    )}
                    {m.resolutionNote && (
                      <CellNote>{m.resolutionNote}</CellNote>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Stack spacing={0.5} alignItems="flex-end">
                      {m.status === "OPEN" && (
                        <>
                          <Button
                            size="small"
                            onClick={() => {
                              setError(null);
                              setTarget({ m, action: "fixed" });
                            }}
                            sx={ds.textBtnSx("success")}
                          >
                            Luxor has been updated
                          </Button>
                          <Button
                            size="small"
                            onClick={() => {
                              setError(null);
                              setTarget({ m, action: "accept" });
                            }}
                            sx={ds.textBtnSx("danger")}
                          >
                            Accept Luxor&apos;s address
                          </Button>
                          <Button
                            size="small"
                            onClick={() => {
                              setError(null);
                              setTarget({ m, action: "recheck" });
                            }}
                            sx={ds.textBtnSx()}
                          >
                            Re-check now
                          </Button>
                        </>
                      )}
                      <Button
                        size="small"
                        onClick={() => setHistoryFor(m.poolSubaccountId)}
                        sx={ds.textBtnSx()}
                      >
                        History
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <NoteActionDialog
        open={Boolean(target)}
        title={
          target
            ? `${ACTION_COPY[target.action].title} · ${target.m.subaccountName}`
            : ""
        }
        description={
          target && (
            <>
              {ACTION_COPY[target.action].description}
              <Box sx={{ ...monoSx, mt: 1.5 }}>
                Our record: {target.m.currentRecord ?? "(none)"}
              </Box>
              <Box sx={monoSx}>
                Luxor (last seen): {target.m.luxorAddress ?? "(none)"}
              </Box>
            </>
          )
        }
        confirmLabel={target ? ACTION_COPY[target.action].confirm : ""}
        busy={busy}
        error={error}
        onClose={() => setTarget(null)}
        onConfirm={run}
      />
      <WalletHistoryDialog
        poolSubaccountId={historyFor}
        onClose={() => setHistoryFor(null)}
      />
      {stepUpDialog}
    </>
  );
}
