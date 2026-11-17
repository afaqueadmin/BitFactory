"use client";

import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import {
  CellNote,
  DaylightEmptyState,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import NoteActionDialog from "@/components/wallets/NoteActionDialog";
import WalletHistoryDialog from "@/components/wallets/WalletHistoryDialog";
import {
  CHECK_LABEL,
  SOURCE_LABEL,
  fmtBtc,
  fmtDate,
  fmtDateTime,
  monoSx,
  personLabel,
} from "@/components/wallets/walletLabels";

export interface WalletRow {
  poolSubaccountId: string;
  subaccountName: string;
  customer: {
    id: string;
    name: string | null;
    email: string;
    isDeleted: boolean;
  } | null;
  hasRecord: boolean;
  address: string | null;
  source: string | null;
  effectiveFrom: string | null;
  lastCheckedAt: string | null;
  lastCheckStatus: string | null;
  lastCheckError: string | null;
  openMismatch: { id: string; detectedAt: string } | null;
  paidToCurrent: { count: number; btc: number; last: string | null };
}

/** Every client subaccount and the payout address we expect Luxor to hold. */
export default function CurrentWalletsTab({
  rows,
  onChanged,
  onOpenMismatches,
}: {
  rows: WalletRow[];
  onChanged: () => void;
  onOpenMismatches: () => void;
}) {
  const ds = useDaylightAdminSx();
  const [search, setSearch] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [recheck, setRecheck] = useState<WalletRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const visible = q
    ? rows.filter((r) =>
        [r.subaccountName, r.customer?.name, r.customer?.email, r.address]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : rows;

  const doRecheck = async (note: string) => {
    if (!recheck) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/wallets/${recheck.poolSubaccountId}/recheck`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Re-check failed");
      const status = body.data?.status as string;
      setNotice(
        `${recheck.subaccountName}: ${
          status === "MISMATCH"
            ? "Luxor differs from our record - see Mismatch Alerts"
            : (CHECK_LABEL[status]?.label ?? status)
        }`,
      );
      setRecheck(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-check failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          id="wallets-search"
          size="small"
          label="Search customer, subaccount or address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: { sm: 340 }, ...ds.inputSx }}
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

      {visible.length === 0 ? (
        <DaylightEmptyState>No subaccounts match.</DaylightEmptyState>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={ds.tableCardSx}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Customer / subaccount</TableCell>
                <TableCell>Payout address (our record)</TableCell>
                <TableCell>Since</TableCell>
                <TableCell>Last Luxor check</TableCell>
                <TableCell align="right">Paid to this address</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((r) => {
                const check = r.lastCheckStatus
                  ? CHECK_LABEL[r.lastCheckStatus]
                  : null;
                return (
                  <TableRow key={r.poolSubaccountId} hover>
                    <TableCell>
                      {personLabel(r.customer)}
                      {r.customer?.isDeleted && (
                        <CellNote tone="danger">Account deleted</CellNote>
                      )}
                      <CellNote>{r.subaccountName}</CellNote>
                    </TableCell>
                    <TableCell sx={{ "&&&": { minWidth: 240, maxWidth: 320 } }}>
                      {r.hasRecord ? (
                        <Box sx={monoSx}>
                          {r.address ?? "No address on Luxor"}
                        </Box>
                      ) : (
                        <CellNote tone="danger">
                          No record yet - Luxor couldn&apos;t be read when
                          records were started
                        </CellNote>
                      )}
                      {r.source && (
                        <CellNote>
                          {SOURCE_LABEL[r.source] ?? r.source}
                        </CellNote>
                      )}
                    </TableCell>
                    <TableCell>{fmtDate(r.effectiveFrom)}</TableCell>
                    <TableCell>
                      {r.openMismatch ? (
                        <Button
                          size="small"
                          onClick={onOpenMismatches}
                          sx={ds.textBtnSx("danger")}
                        >
                          Mismatch open
                        </Button>
                      ) : check ? (
                        <DaylightStatusPill
                          label={check.label}
                          tone={check.tone}
                        />
                      ) : (
                        "—"
                      )}
                      <CellNote>{fmtDateTime(r.lastCheckedAt)}</CellNote>
                      {r.lastCheckError && (
                        <CellNote tone="danger">{r.lastCheckError}</CellNote>
                      )}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {r.paidToCurrent.count > 0 ? (
                        <>
                          {fmtBtc(r.paidToCurrent.btc)}
                          <CellNote>
                            {r.paidToCurrent.count} payout(s), last{" "}
                            {fmtDate(r.paidToCurrent.last)}
                          </CellNote>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack
                        direction="row"
                        spacing={1}
                        justifyContent="flex-end"
                      >
                        <Button
                          size="small"
                          onClick={() => setHistoryFor(r.poolSubaccountId)}
                          sx={ds.textBtnSx()}
                        >
                          History
                        </Button>
                        <Button
                          size="small"
                          disabled={!r.hasRecord}
                          onClick={() => {
                            setError(null);
                            setRecheck(r);
                          }}
                          sx={ds.textBtnSx()}
                        >
                          Re-check
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <WalletHistoryDialog
        poolSubaccountId={historyFor}
        onClose={() => setHistoryFor(null)}
      />
      <NoteActionDialog
        open={Boolean(recheck)}
        title={`Re-check ${recheck?.subaccountName ?? ""} against Luxor`}
        description="Reads the payout address on Luxor now and compares it with our record. If they differ, a mismatch alert is opened."
        confirmLabel="Re-check now"
        busy={busy}
        error={error}
        onClose={() => setRecheck(null)}
        onConfirm={doRecheck}
      />
    </>
  );
}
