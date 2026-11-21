"use client";

import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  InputAdornment,
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
import SearchIcon from "@mui/icons-material/Search";
import {
  CellNote,
  DaylightEmptyState,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import NoteActionDialog from "@/components/wallets/NoteActionDialog";
import WalletHistoryDialog from "@/components/wallets/WalletHistoryDialog";
import {
  AddressBox,
  FilterChips,
  WALLET_STATE,
  type WalletState,
} from "@/components/wallets/WalletUi";
import { asDate, useSortableRows } from "@/components/wallets/useSortableRows";
import {
  CHECK_LABEL,
  SOURCE_LABEL,
  fmtBtc,
  fmtDate,
  fmtDateTime,
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

export function walletState(r: WalletRow): WalletState {
  if (r.openMismatch) return "mismatch";
  if (!r.hasRecord) return "norecord";
  switch (r.lastCheckStatus) {
    case "MATCH":
      return "match";
    case "MISMATCH":
      return "mismatch";
    case "LUXOR_EMPTY":
      return "empty";
    case "ERROR":
      return "error";
    default:
      return "unchecked";
  }
}

type Filter = "all" | "attention" | WalletState;
type SortKey =
  "customer" | "subaccount" | "state" | "since" | "checked" | "paid";

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
  const [filter, setFilter] = useState<Filter>("all");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [recheck, setRecheck] = useState<WalletRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<WalletState, number> = {
      match: 0,
      mismatch: 0,
      empty: 0,
      error: 0,
      norecord: 0,
      unchecked: 0,
    };
    for (const r of rows) c[walletState(r)]++;
    return c;
  }, [rows]);
  const attention = counts.mismatch + counts.norecord + counts.error;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const s = walletState(r);
      if (
        filter === "attention" &&
        !["mismatch", "norecord", "error"].includes(s)
      )
        return false;
      if (filter !== "all" && filter !== "attention" && s !== filter)
        return false;
      if (!q) return true;
      return [r.subaccountName, r.customer?.name, r.customer?.email, r.address]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, filter]);

  const { sorted, sortCell } = useSortableRows<WalletRow, SortKey>(
    visible,
    {
      customer: (r) => personLabel(r.customer),
      subaccount: (r) => r.subaccountName,
      state: (r) => WALLET_STATE[walletState(r)].order,
      since: (r) => asDate(r.effectiveFrom),
      checked: (r) => asDate(r.lastCheckedAt),
      paid: (r) => r.paidToCurrent.btc,
    },
    { key: "state", dir: "asc" },
  );

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
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems={{ md: "center" }}
        justifyContent="space-between"
        sx={{ mb: 2.5 }}
      >
        <FilterChips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: rows.length },
            {
              value: "attention",
              label: "Needs attention",
              count: attention,
              tone: "danger",
            },
            {
              value: "match",
              label: "Matches Luxor",
              count: counts.match,
              tone: "success",
            },
            {
              value: "empty",
              label: "No address on Luxor",
              count: counts.empty,
              tone: "warning",
            },
          ]}
        />
        <TextField
          id="wallets-search"
          size="small"
          placeholder="Search customer, subaccount or address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: { md: 320 }, ...ds.inputSx }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18 }} />
                </InputAdornment>
              ),
            },
          }}
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

      {sorted.length === 0 ? (
        <DaylightEmptyState>
          {rows.length === 0
            ? "No client subaccounts yet."
            : "No subaccounts match this filter."}
        </DaylightEmptyState>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={ds.tableCardSx}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {sortCell("customer", "Customer")}
                {sortCell("subaccount", "Subaccount")}
                <TableCell>Payout address (our record)</TableCell>
                {sortCell("state", "Status")}
                {sortCell("since", "Since", { firstDir: "desc" })}
                {sortCell("checked", "Last check", { firstDir: "desc" })}
                {sortCell("paid", "Paid to address", {
                  firstDir: "desc",
                  align: "right",
                })}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((r) => {
                const state = WALLET_STATE[walletState(r)];
                return (
                  <TableRow key={r.poolSubaccountId} hover>
                    <TableCell sx={{ "&&&": { minWidth: 160 } }}>
                      <Box sx={{ fontWeight: 600 }}>
                        {r.customer?.name || r.customer?.email || "—"}
                      </Box>
                      {r.customer?.name && (
                        <CellNote>{r.customer.email}</CellNote>
                      )}
                      {r.customer?.isDeleted && (
                        <CellNote tone="danger">Account deleted</CellNote>
                      )}
                    </TableCell>
                    <TableCell>
                      <Box
                        component="span"
                        sx={{
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                          fontSize: 12,
                        }}
                      >
                        {r.subaccountName}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ "&&&": { minWidth: 260 } }}>
                      {r.hasRecord ? (
                        <AddressBox
                          address={r.address}
                          empty="No address on Luxor"
                          tone={r.openMismatch ? "danger" : undefined}
                        />
                      ) : (
                        <CellNote tone="danger">
                          No record - Luxor couldn&apos;t be read when records
                          were started
                        </CellNote>
                      )}
                      {r.source && (
                        <CellNote>
                          {SOURCE_LABEL[r.source] ?? r.source}
                        </CellNote>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.openMismatch ? (
                        <Box
                          component="button"
                          type="button"
                          onClick={onOpenMismatches}
                          sx={{
                            all: "unset",
                            cursor: "pointer",
                            "&:focus-visible": { outline: "2px solid" },
                          }}
                          aria-label="Open mismatch alerts"
                        >
                          <DaylightStatusPill
                            label="Mismatch ›"
                            tone="danger"
                          />
                        </Box>
                      ) : (
                        <DaylightStatusPill
                          label={state.label}
                          tone={state.tone}
                        />
                      )}
                      {r.lastCheckError && (
                        <CellNote tone="danger">{r.lastCheckError}</CellNote>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {fmtDate(r.effectiveFrom)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {fmtDateTime(r.lastCheckedAt)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.paidToCurrent.count > 0 ? (
                        <>
                          <Box sx={{ fontWeight: 600 }}>
                            {fmtBtc(r.paidToCurrent.btc)}
                          </Box>
                          <CellNote>
                            {r.paidToCurrent.count} payout
                            {r.paidToCurrent.count === 1 ? "" : "s"} · last{" "}
                            {fmtDate(r.paidToCurrent.last)}
                          </CellNote>
                        </>
                      ) : (
                        <CellNote>No payouts yet</CellNote>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack
                        direction="row"
                        spacing={0.5}
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
      <CellNote>
        Showing {sorted.length} of {rows.length} subaccount
        {rows.length === 1 ? "" : "s"}. Click a column heading to sort.
      </CellNote>

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
