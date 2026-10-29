"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
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
  DaylightAdminPage,
  DaylightEmptyState,
  DaylightLoading,
  DaylightPageHeader,
  DaylightStatusPill,
  requestStatusTone,
  statusLabel,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import { useStepUp } from "@/components/StepUpDialog";

const STATUSES = ["PENDING", "CONFIRMED", "APPROVED", "REJECTED"];
// Pending and Confirmed together: everything still needing an admin step.
const OPEN = "OPEN";
const DONE_NOTICE = {
  confirm: "Confirmed - it still needs Approve before the change applies",
  approve: "Approved - the change has been applied",
  reject: "Rejected - the Guildmaster has been emailed",
};

type Person = { id: string; name: string | null; email: string };
type Line = {
  membershipId: string;
  currentPercent: string;
  requestedPercent: string;
  membership: { user: Person };
};

interface GuildRequest {
  kind: "wallet" | "split" | "member";
  id: string;
  status: string;
  reason: string | null;
  rejectionReason: string | null;
  createdAt: string;
  confirmationMethod: string | null;
  confirmationContact: string | null;
  guild: { id: string; name: string };
  requestedBy: Person;
  requestedByEmail: string | null;
  requestedBySecondary: boolean;
  confirmedBy: Person | null;
  // wallet
  membership?: { user: Person };
  currentAddress?: string | null;
  requestedAddress?: string;
  // split and member (the new split)
  lines?: Line[];
  // member
  action?: "ADD" | "REMOVE";
  newName?: string | null;
  newEmail?: string | null;
  newPhoneNumber?: string | null;
  newPercent?: string | null;
  newWalletAddress?: string | null;
}

const who = (p: Person) => p.name || p.email;
const mono = {
  fontFamily: "monospace",
  fontSize: 12,
  wordBreak: "break-all",
} as const;

export default function GuildRequestsPage() {
  const ds = useDaylightAdminSx();
  const { withStepUp, stepUpDialog } = useStepUp();
  // All statuses by default, so a request never drops out of view after an
  // action (a confirmed one still needs Approve).
  const [status, setStatus] = useState("");
  const [requests, setRequests] = useState<GuildRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<GuildRequest | null>(null);
  const [method, setMethod] = useState<"CALL" | "EMAIL" | "">("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [rejectTarget, setRejectTarget] = useState<GuildRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/guild-requests${status ? `?status=${status}` : ""}`,
        { credentials: "include" },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load requests");
      setRequests(body.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (
    req: GuildRequest,
    action: "confirm" | "approve" | "reject",
    body: Record<string, unknown> = {},
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await withStepUp((creds) =>
        fetch(`/api/guild-requests/${req.kind}/${req.id}/${action}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, ...creds }),
        }),
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update the request");
      }
      setNotice(DONE_NOTICE[action]);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update the request");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Guild Requests"
        description="Guildmasters' requests to change a member's reward wallet or the guild's reward split, or to add or remove a member. Confirm with the Guildmaster (call or email) first, then approve. The change applies on approval (a new member's account is created then, a removed member's closed); the guild's next distribution waits 24 hours after it."
      />

      <Stack direction="row" sx={{ mb: 3 }}>
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 220, ...ds.inputSx }}
        >
          <MenuItem value="">All statuses</MenuItem>
          <MenuItem value={OPEN}>Waiting for review</MenuItem>
          {STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {statusLabel(s)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {error && (
        <Alert
          severity="error"
          sx={{ ...ds.alertSx("error"), mb: 2 }}
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}
      {notice && (
        <Alert
          severity="success"
          sx={{ ...ds.alertSx("success"), mb: 2 }}
          onClose={() => setNotice(null)}
        >
          {notice}
        </Alert>
      )}

      {loading ? (
        <DaylightLoading />
      ) : requests.length === 0 ? (
        <DaylightEmptyState>No requests found.</DaylightEmptyState>
      ) : (
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={ds.tableCardSx}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Guild</TableCell>
                <TableCell>Requested</TableCell>
                <TableCell>Change</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={`${req.kind}-${req.id}`}>
                  <TableCell>
                    <Link href={`/guilds/${req.guild.id}`}>
                      {req.guild.name}
                    </Link>
                    <CellNote>By {who(req.requestedBy)}</CellNote>
                    {req.requestedBySecondary && req.requestedByEmail && (
                      <CellNote>
                        via {req.requestedByEmail} (secondary sign-in)
                      </CellNote>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(req.createdAt).toLocaleDateString()}
                    <CellNote>
                      {new Date(req.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </CellNote>
                  </TableCell>
                  <TableCell sx={{ "&&&": { minWidth: 240, maxWidth: 340 } }}>
                    {req.kind === "wallet" ? (
                      <>
                        Reward wallet for{" "}
                        {req.membership && who(req.membership.user)}
                        <Box sx={{ ...mono, mt: 0.5 }}>
                          New: {req.requestedAddress}
                        </Box>
                        <Box sx={{ ...mono, color: "text.secondary" }}>
                          Current: {req.currentAddress || "Not set"}
                        </Box>
                      </>
                    ) : req.kind === "member" ? (
                      <>
                        {req.action === "ADD" ? (
                          <>
                            Add member <strong>{req.newName}</strong> at{" "}
                            <strong>{Number(req.newPercent)}%</strong>
                            <CellNote>
                              {req.newEmail}
                              {req.newPhoneNumber
                                ? ` · ${req.newPhoneNumber}`
                                : ""}
                            </CellNote>
                            <Box sx={{ ...mono, mt: 0.5 }}>
                              Wallet: {req.newWalletAddress || "Not set"}
                            </Box>
                          </>
                        ) : (
                          <>
                            Remove member{" "}
                            <strong>
                              {req.membership && who(req.membership.user)}
                            </strong>
                            <CellNote>Their account is closed</CellNote>
                          </>
                        )}
                        <CellNote>New split:</CellNote>
                        {req.lines?.map((l) => (
                          <CellNote key={l.membershipId}>
                            {who(l.membership.user)}: {Number(l.currentPercent)}
                            % → <strong>{Number(l.requestedPercent)}%</strong>
                          </CellNote>
                        ))}
                      </>
                    ) : (
                      <>
                        New reward split
                        {req.lines?.map((l) => (
                          <CellNote key={l.membershipId}>
                            {who(l.membership.user)}: {Number(l.currentPercent)}
                            % → <strong>{Number(l.requestedPercent)}%</strong>
                          </CellNote>
                        ))}
                      </>
                    )}
                  </TableCell>
                  <TableCell>{req.reason || "—"}</TableCell>
                  <TableCell sx={{ "&&&": { minWidth: 160 } }}>
                    <DaylightStatusPill
                      label={statusLabel(req.status)}
                      tone={requestStatusTone(req.status)}
                    />
                    {req.status === "REJECTED" && req.rejectionReason && (
                      <CellNote>{req.rejectionReason}</CellNote>
                    )}
                    {req.confirmationMethod && req.status !== "PENDING" && (
                      <CellNote>
                        Confirmed via{" "}
                        {req.confirmationMethod === "EMAIL" ? "email" : "call"}{" "}
                        ({req.confirmationContact}) by{" "}
                        {req.confirmedBy && who(req.confirmedBy)}
                      </CellNote>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="column" alignItems="flex-end" spacing={1}>
                      {req.status === "PENDING" && (
                        <Button
                          size="small"
                          variant="contained"
                          sx={ds.primaryBtnSx}
                          disabled={busy}
                          onClick={() => setConfirmTarget(req)}
                        >
                          Confirm
                        </Button>
                      )}
                      {req.status === "CONFIRMED" && (
                        <Button
                          size="small"
                          variant="contained"
                          sx={ds.successBtnSx}
                          disabled={busy}
                          onClick={() => act(req, "approve")}
                        >
                          Approve
                        </Button>
                      )}
                      {(req.status === "PENDING" ||
                        req.status === "CONFIRMED") && (
                        <Button
                          size="small"
                          variant="outlined"
                          sx={ds.dangerOutlineBtnSx}
                          disabled={busy}
                          onClick={() => setRejectTarget(req)}
                        >
                          Reject
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Confirm with the Guildmaster</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl>
              <FormLabel>How did you confirm it?</FormLabel>
              <RadioGroup
                row
                value={method}
                onChange={(e) => setMethod(e.target.value as "CALL" | "EMAIL")}
              >
                <FormControlLabel
                  value="CALL"
                  control={<Radio />}
                  label="Phone call"
                />
                <FormControlLabel
                  value="EMAIL"
                  control={<Radio />}
                  label="Email"
                />
              </RadioGroup>
            </FormControl>
            <TextField
              size="small"
              label={
                method === "EMAIL"
                  ? "Email address used"
                  : "Phone number called"
              }
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              sx={ds.inputSx}
            />
            <TextField
              size="small"
              label="Note"
              multiline
              minRows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              sx={ds.inputSx}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            sx={ds.primaryBtnSx}
            disabled={busy || !method || !contact.trim() || !note.trim()}
            onClick={async () => {
              if (!confirmTarget) return;
              const ok = await act(confirmTarget, "confirm", {
                confirmationMethod: method,
                confirmationContact: contact,
                confirmationNote: note,
              });
              if (ok) {
                setConfirmTarget(null);
                setMethod("");
                setContact("");
                setNote("");
              }
            }}
          >
            Record confirmation
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Reject request</DialogTitle>
        <DialogContent>
          <TextField
            size="small"
            label="Reason (sent to the Guildmaster)"
            fullWidth
            multiline
            minRows={2}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            sx={{ ...ds.inputSx, mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={busy || !rejectionReason.trim()}
            onClick={async () => {
              if (!rejectTarget) return;
              const ok = await act(rejectTarget, "reject", { rejectionReason });
              if (ok) {
                setRejectTarget(null);
                setRejectionReason("");
              }
            }}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>
      {stepUpDialog}
    </DaylightAdminPage>
  );
}
