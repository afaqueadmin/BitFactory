"use client";

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
import {
  CellNote,
  DaylightLoading,
  DaylightStatusPill,
  requestStatusTone,
  statusLabel,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import {
  MISMATCH_STATUS,
  SOURCE_LABEL,
  fmtBtc,
  fmtDate,
  fmtDateTime,
  monoSx,
  personLabel,
} from "@/components/wallets/walletLabels";

type Person = { id: string; name: string | null; email: string } | null;
type Paid = {
  count: number;
  btc: number;
  first: string | null;
  last: string | null;
};

interface HistoryData {
  subaccountName: string;
  customer: Person;
  history: {
    id: string;
    address: string | null;
    source: string;
    validFrom: string;
    validTo: string | null;
    note: string | null;
    actor: Person;
    paid: Paid;
  }[];
  otherPayouts: Paid[];
  mismatches: {
    id: string;
    status: string;
    expectedAddress: string | null;
    luxorAddress: string | null;
    detectedAt: string;
    resolvedAt: string | null;
    resolvedBy: Person;
    resolutionNote: string | null;
  }[];
  changeRequests: {
    id: string;
    status: string;
    currentAddress: string | null;
    requestedAddress: string;
    createdAt: string;
    reviewedAt: string | null;
    reviewedBy: Person;
    rejectionReason: string | null;
  }[];
}

/** Everything about one subaccount's payout wallet over time. Audited on open. */
export default function WalletHistoryDialog({
  poolSubaccountId,
  onClose,
}: {
  poolSubaccountId: string | null;
  onClose: () => void;
}) {
  const ds = useDaylightAdminSx();
  const [data, setData] = useState<HistoryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!poolSubaccountId) return;
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/wallets/${poolSubaccountId}/history`, {
      credentials: "include",
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load history");
        if (!cancelled) setData(body.data);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [poolSubaccountId]);

  const section = (title: string) => (
    <Typography sx={{ ...ds.sectionTitleSx, mt: 3, mb: 1 }}>{title}</Typography>
  );

  return (
    <Dialog
      open={Boolean(poolSubaccountId)}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
    >
      <DialogTitle>
        Wallet history{data ? ` · ${data.subaccountName}` : ""}
        {data?.customer && <CellNote>{personLabel(data.customer)}</CellNote>}
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{error}</Alert>}
        {!data && !error && <DaylightLoading />}
        {data && (
          <>
            {section("Addresses")}
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" sx={ds.tableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>Address</TableCell>
                    <TableCell>From</TableCell>
                    <TableCell>Until</TableCell>
                    <TableCell>How we got it</TableCell>
                    <TableCell align="right">
                      Paid to this address (all time)
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell sx={{ "&&&": { minWidth: 260 } }}>
                        <Box sx={monoSx}>{h.address ?? "(none)"}</Box>
                        {h.note && <CellNote>{h.note}</CellNote>}
                      </TableCell>
                      <TableCell>{fmtDate(h.validFrom)}</TableCell>
                      <TableCell>
                        {h.validTo ? (
                          fmtDate(h.validTo)
                        ) : (
                          <DaylightStatusPill label="Current" tone="success" />
                        )}
                      </TableCell>
                      <TableCell>
                        {SOURCE_LABEL[h.source] ?? h.source}
                        {h.actor && (
                          <CellNote>by {personLabel(h.actor)}</CellNote>
                        )}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {h.paid.count > 0 ? (
                          <>
                            {fmtBtc(h.paid.btc)}
                            <CellNote>
                              {h.paid.count} payout(s), last{" "}
                              {fmtDate(h.paid.last)}
                            </CellNote>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {data.history.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        No address recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
            {data.otherPayouts.length > 0 && (
              <CellNote>
                Also paid to {data.otherPayouts.length} address(es) not in this
                history:{" "}
                {data.otherPayouts
                  .map((p) => `${fmtBtc(p.btc)} (${p.count} payouts)`)
                  .join(", ")}
              </CellNote>
            )}

            {section("Luxor mismatches")}
            {data.mismatches.length === 0 ? (
              <CellNote>None.</CellNote>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={ds.tableSx}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Detected</TableCell>
                      <TableCell>Our record / Luxor</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Resolution</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.mismatches.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{fmtDateTime(m.detectedAt)}</TableCell>
                        <TableCell sx={{ "&&&": { minWidth: 260 } }}>
                          <Box sx={monoSx}>
                            Ours: {m.expectedAddress ?? "(none)"}
                          </Box>
                          <Box sx={monoSx}>
                            Luxor: {m.luxorAddress ?? "(none)"}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <DaylightStatusPill
                            label={MISMATCH_STATUS[m.status]?.label ?? m.status}
                            tone={MISMATCH_STATUS[m.status]?.tone ?? "neutral"}
                          />
                        </TableCell>
                        <TableCell>
                          {m.resolvedAt ? (
                            <>
                              {fmtDateTime(m.resolvedAt)} by{" "}
                              {personLabel(m.resolvedBy)}
                              {m.resolutionNote && (
                                <CellNote>{m.resolutionNote}</CellNote>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}

            {section("Change requests")}
            {data.changeRequests.length === 0 ? (
              <CellNote>None.</CellNote>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={ds.tableSx}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Requested</TableCell>
                      <TableCell>From / to</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Reviewed</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.changeRequests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{fmtDate(r.createdAt)}</TableCell>
                        <TableCell sx={{ "&&&": { minWidth: 260 } }}>
                          <Box sx={monoSx}>
                            From: {r.currentAddress ?? "(none)"}
                          </Box>
                          <Box sx={monoSx}>To: {r.requestedAddress}</Box>
                        </TableCell>
                        <TableCell>
                          <DaylightStatusPill
                            label={statusLabel(r.status)}
                            tone={requestStatusTone(r.status)}
                          />
                          {r.rejectionReason && (
                            <CellNote tone="danger">
                              {r.rejectionReason}
                            </CellNote>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.reviewedAt
                            ? `${fmtDate(r.reviewedAt)} by ${personLabel(r.reviewedBy)}`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={ds.outlineBtnSx}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
