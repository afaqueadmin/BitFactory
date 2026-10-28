"use client";

/**
 * Guild page - for Guildmasters and Guildmembers (Daylight theme).
 *
 * Everyone sees every member's name and reward percentage, their own reward
 * wallet (never anyone else's) and their own share of each month's reward.
 * The Guildmaster can also request a member's wallet change, a new split, or
 * adding or removing a member; an admin confirms and approves each request.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";
import { useStepUp } from "@/components/StepUpDialog";
import { formatBtc, formatMonth } from "@/lib/guilds/format";

interface GuildView {
  guild: { id: string; name: string };
  isGuildmaster: boolean;
  myMembershipId: string;
  myWallet: {
    address: string | null;
    network: string;
    carriedBtc: number;
    updatedAt: string | null;
  };
  members: {
    membershipId: string;
    name: string;
    isGuildmaster: boolean;
    percent: number;
    isMe: boolean;
  }[];
  myShares: {
    rewardMonth: string;
    status: string;
    percent: number;
    btcAmount: number;
    carriedInBtc: number;
    paidBtc: number;
    carriedOutBtc: number;
    carryReason: string | null;
    txUrl: string | null;
    wallet: string | null;
    settledAt: string | null;
    guildPayoutBtc: number;
    hostingBtc: number;
  }[];
  walletRequests: {
    id: string;
    membershipId: string;
    requestedAddress: string;
    status: string;
    rejectionReason: string | null;
    createdAt: string;
  }[];
  splitRequests: {
    id: string;
    status: string;
    rejectionReason: string | null;
    createdAt: string;
    lines: { membershipId: string; requestedPercent: string }[];
  }[];
  memberRequests: {
    id: string;
    action: "ADD" | "REMOVE";
    name: string | null;
    percent: number | null;
    status: string;
    rejectionReason: string | null;
    createdAt: string;
  }[];
}

type SplitLine = { membershipId: string; percent: number };

/** Exactly 100%, to four decimals (the stored precision). */
const isHundred = (total: number) => Math.round(total * 10000) === 1_000_000;

const REQUEST_STATUS: Record<string, string> = {
  PENDING: "Waiting for our team to confirm with you",
  CONFIRMED: "Confirmed, waiting for approval",
  APPROVED: "Approved",
  REJECTED: "Not approved",
};

const SHARE_STATUS: Record<string, string> = {
  SETTLED: "Done",
  CALCULATED: "Worked out",
  QUEUED: "Being sent",
  BROADCAST: "Sent, confirming",
  HELD: "On hold",
  FAILED: "Delayed",
};

export default function GuildPage() {
  const { d, fonts } = useDaylight();
  const { withStepUp, stepUpDialog } = useStepUp();
  const [view, setView] = useState<GuildView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/guild", { credentials: "include" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load your guild");
      setView(body.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load your guild");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (payload: Record<string, unknown>) => {
    setError(null);
    const res = await withStepUp((creds) =>
      fetch("/api/guild/requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, ...creds }),
      }),
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Failed to submit the request");
    setNotice(
      "Request sent. Our team will contact you to confirm it before it takes effect.",
    );
    await load();
  };

  const cardSx = {
    bgcolor: d.surface,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS_CARD,
    boxShadow: d.shadow,
    p: { xs: 2.5, sm: 3 },
  };
  const headingSx = {
    fontFamily: fonts.heading,
    fontWeight: 650,
    fontSize: 16,
    color: d.text,
    m: 0,
    mb: 1.5,
  };
  const mono = {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 13,
    wordBreak: "break-all" as const,
    color: d.text,
  };
  const cellSx = {
    fontFamily: fonts.body,
    fontSize: 13,
    color: d.text,
    borderColor: d.border,
  };
  const headCellSx = {
    ...cellSx,
    fontSize: 11,
    color: d.muted,
    textTransform: "uppercase" as const,
  };

  if (loading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!view) {
    return <Alert severity="error">{error ?? "You're not in a guild"}</Alert>;
  }

  const nameOf = (membershipId: string) =>
    view.members.find((m) => m.membershipId === membershipId)?.name ??
    "A former member";

  return (
    <Stack
      spacing={3}
      sx={{ maxWidth: 1100, mx: "auto", fontFamily: fonts.body }}
    >
      <Box>
        <Typography
          component="h1"
          sx={{
            fontFamily: fonts.heading,
            fontWeight: 700,
            fontSize: 24,
            color: d.text,
          }}
        >
          {view.guild.name}
        </Typography>
        <Typography sx={{ fontSize: 13, color: d.muted }}>
          {view.isGuildmaster
            ? "You're the Guildmaster - the guild's point of contact."
            : "You're a member of this guild. You can view everything here; the Guildmaster handles changes."}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gap: 3,
          gridTemplateColumns: { xs: "1fr", md: "3fr 2fr" },
        }}
      >
        <Box sx={cardSx}>
          <Typography component="h2" sx={headingSx}>
            Members and reward split
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>Member</TableCell>
                <TableCell sx={headCellSx} align="right">
                  Share of reward
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {view.members.map((m) => (
                <TableRow key={m.membershipId}>
                  <TableCell sx={{ ...cellSx, fontWeight: m.isMe ? 650 : 400 }}>
                    {m.name}
                    {m.isMe ? " (you)" : ""}
                    {m.isGuildmaster && (
                      <Box
                        component="span"
                        sx={{ display: "block", fontSize: 11, color: d.muted }}
                      >
                        Guildmaster
                      </Box>
                    )}
                  </TableCell>
                  <TableCell sx={cellSx} align="right">
                    {m.percent}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Typography sx={{ fontSize: 12, color: d.muted, mt: 1.5 }}>
            Each month the guild&apos;s reward first pays its hosting and
            colocation, then the rest is split by these percentages.
          </Typography>
          {view.isGuildmaster && (
            <Stack direction="row" sx={{ mt: 2, flexWrap: "wrap", gap: 1 }}>
              <Button
                variant="outlined"
                sx={{ textTransform: "none" }}
                onClick={() => setSplitOpen(true)}
              >
                Request a new split
              </Button>
              <Button
                variant="outlined"
                sx={{ textTransform: "none" }}
                onClick={() => setAddOpen(true)}
              >
                Request to add a member
              </Button>
              <Button
                variant="outlined"
                sx={{ textTransform: "none" }}
                disabled={!view.members.some((m) => !m.isGuildmaster)}
                onClick={() => setRemoveOpen(true)}
              >
                Request to remove a member
              </Button>
            </Stack>
          )}
        </Box>

        <Box sx={cardSx}>
          <Typography component="h2" sx={headingSx}>
            Your reward wallet
          </Typography>
          <Box sx={mono}>{view.myWallet.address ?? "Not set yet"}</Box>
          {view.myWallet.updatedAt && (
            <Typography sx={{ fontSize: 12, color: d.muted, mt: 0.5 }}>
              Set {new Date(view.myWallet.updatedAt).toLocaleDateString()}
            </Typography>
          )}
          {view.myWallet.carriedBtc > 0 && (
            <Typography sx={{ fontSize: 13, color: d.text, mt: 1.5 }}>
              <strong>{formatBtc(view.myWallet.carriedBtc)}</strong> carried to
              your next payout.
            </Typography>
          )}
          <Typography sx={{ fontSize: 12, color: d.muted, mt: 1.5 }}>
            Your share is sent here. For everyone&apos;s security, members only
            see their own wallet.
            {view.isGuildmaster ? "" : " To change it, ask your Guildmaster."}
          </Typography>
          {view.isGuildmaster && (
            <Button
              variant="outlined"
              sx={{ mt: 2, textTransform: "none" }}
              onClick={() => setWalletOpen(true)}
            >
              Request a wallet change
            </Button>
          )}
        </Box>
      </Box>

      <Box sx={cardSx}>
        <Typography component="h2" sx={headingSx}>
          Your monthly rewards
        </Typography>
        {view.myShares.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: d.muted }}>
            Nothing yet. Luxor pays the guild once a month; your share shows
            here once it&apos;s worked out.
          </Typography>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headCellSx}>Month</TableCell>
                  <TableCell sx={headCellSx} align="right">
                    Guild reward
                  </TableCell>
                  <TableCell sx={headCellSx} align="right">
                    Hosting paid
                  </TableCell>
                  <TableCell sx={headCellSx} align="right">
                    Your share
                  </TableCell>
                  <TableCell sx={headCellSx} align="right">
                    Sent to you
                  </TableCell>
                  <TableCell sx={headCellSx}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {view.myShares.map((s) => (
                  <TableRow key={s.rewardMonth}>
                    <TableCell sx={cellSx}>
                      {formatMonth(s.rewardMonth)}
                    </TableCell>
                    <TableCell sx={cellSx} align="right">
                      {formatBtc(s.guildPayoutBtc)}
                    </TableCell>
                    <TableCell sx={cellSx} align="right">
                      {formatBtc(s.hostingBtc)}
                    </TableCell>
                    <TableCell sx={cellSx} align="right">
                      {formatBtc(s.btcAmount)} ({s.percent}%)
                      {s.carriedInBtc > 0 && (
                        <Box
                          component="span"
                          sx={{
                            display: "block",
                            fontSize: 11,
                            color: d.muted,
                          }}
                        >
                          + {formatBtc(s.carriedInBtc)} carried in
                        </Box>
                      )}
                    </TableCell>
                    <TableCell sx={cellSx} align="right">
                      {s.paidBtc > 0 ? formatBtc(s.paidBtc) : "—"}
                      {s.carriedOutBtc > 0 && (
                        <Box
                          component="span"
                          sx={{
                            display: "block",
                            fontSize: 11,
                            color: d.muted,
                          }}
                        >
                          {formatBtc(s.carriedOutBtc)} carried
                          {s.carryReason ? ` (${s.carryReason})` : ""}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      {SHARE_STATUS[s.status] ?? s.status}
                      {s.txUrl && (
                        <Box
                          component="span"
                          sx={{ display: "block", fontSize: 11 }}
                        >
                          <a
                            href={s.txUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View transaction
                          </a>
                        </Box>
                      )}
                      {s.settledAt && (
                        <Box
                          component="span"
                          sx={{
                            display: "block",
                            fontSize: 11,
                            color: d.muted,
                          }}
                        >
                          {new Date(s.settledAt).toLocaleDateString()}
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Box>

      {view.isGuildmaster &&
        (view.walletRequests.length > 0 ||
          view.splitRequests.length > 0 ||
          view.memberRequests.length > 0) && (
          <Box sx={cardSx}>
            <Typography component="h2" sx={headingSx}>
              Your requests
            </Typography>
            <Stack spacing={1.5}>
              {[
                ...view.walletRequests.map((r) => ({
                  id: r.id,
                  createdAt: r.createdAt,
                  status: r.status,
                  rejectionReason: r.rejectionReason,
                  text: `Wallet for ${nameOf(r.membershipId)}: ${r.requestedAddress}`,
                })),
                ...view.splitRequests.map((r) => ({
                  id: r.id,
                  createdAt: r.createdAt,
                  status: r.status,
                  rejectionReason: r.rejectionReason,
                  text: `New split: ${r.lines
                    .map(
                      (l) =>
                        `${nameOf(l.membershipId)} ${Number(l.requestedPercent)}%`,
                    )
                    .join(", ")}`,
                })),
                ...view.memberRequests.map((r) => ({
                  id: r.id,
                  createdAt: r.createdAt,
                  status: r.status,
                  rejectionReason: r.rejectionReason,
                  text:
                    r.action === "ADD"
                      ? `Add ${r.name} at ${r.percent}%`
                      : `Remove ${r.name ?? "a former member"}`,
                })),
              ]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((r) => (
                  <Box
                    key={r.id}
                    sx={{ borderBottom: `1px solid ${d.border}`, pb: 1.5 }}
                  >
                    <Typography
                      sx={{
                        fontSize: 13,
                        color: d.text,
                        wordBreak: "break-word",
                      }}
                    >
                      {r.text}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: d.muted }}>
                      {new Date(r.createdAt).toLocaleDateString()} ·{" "}
                      {REQUEST_STATUS[r.status] ?? r.status}
                      {r.rejectionReason ? ` - ${r.rejectionReason}` : ""}
                    </Typography>
                  </Box>
                ))}
            </Stack>
          </Box>
        )}

      {view.isGuildmaster && (
        <>
          <WalletRequestDialog
            open={walletOpen}
            members={view.members}
            onClose={() => setWalletOpen(false)}
            onSubmit={async (membershipId, requestedAddress, reason) => {
              await submit({
                kind: "wallet",
                membershipId,
                requestedAddress,
                reason,
              });
              setWalletOpen(false);
            }}
          />
          <SplitRequestDialog
            open={splitOpen}
            members={view.members}
            onClose={() => setSplitOpen(false)}
            onSubmit={async (lines, reason) => {
              await submit({ kind: "split", lines, reason });
              setSplitOpen(false);
            }}
          />
          <AddMemberRequestDialog
            open={addOpen}
            members={view.members}
            onClose={() => setAddOpen(false)}
            onSubmit={async (person, lines, reason) => {
              await submit({ kind: "member-add", person, lines, reason });
              setAddOpen(false);
            }}
          />
          <RemoveMemberRequestDialog
            open={removeOpen}
            members={view.members}
            onClose={() => setRemoveOpen(false)}
            onSubmit={async (membershipId, lines, reason) => {
              await submit({
                kind: "member-remove",
                membershipId,
                lines,
                reason,
              });
              setRemoveOpen(false);
            }}
          />
        </>
      )}
      {stepUpDialog}
    </Stack>
  );
}

function WalletRequestDialog({
  open,
  members,
  onClose,
  onSubmit,
}: {
  open: boolean;
  members: GuildView["members"];
  onClose: () => void;
  onSubmit: (
    membershipId: string,
    address: string,
    reason: string,
  ) => Promise<void>;
}) {
  const [membershipId, setMembershipId] = useState("");
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMembershipId(members.find((m) => m.isMe)?.membershipId ?? "");
      setAddress("");
      setReason("");
      setError(null);
    }
  }, [open, members]);

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Request a wallet change</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <DialogContentText>
            The new wallet takes effect once our team has confirmed it with you
            and approved it. The next payout waits 24 hours after that.
          </DialogContentText>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            select
            size="small"
            label="Member"
            value={membershipId}
            onChange={(e) => setMembershipId(e.target.value)}
          >
            {members.map((m) => (
              <MenuItem key={m.membershipId} value={m.membershipId}>
                {m.name}
                {m.isMe ? " (you)" : ""}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="New Bitcoin wallet address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <TextField
            size="small"
            label="Reason (optional)"
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={busy || !membershipId || !address.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSubmit(membershipId, address.trim(), reason.trim());
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to submit");
            } finally {
              setBusy(false);
            }
          }}
        >
          Send request
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SplitRequestDialog({
  open,
  members,
  onClose,
  onSubmit,
}: {
  open: boolean;
  members: GuildView["members"];
  onClose: () => void;
  onSubmit: (
    lines: { membershipId: string; percent: number }[],
    reason: string,
  ) => Promise<void>;
}) {
  const [percents, setPercents] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPercents(
        Object.fromEntries(
          members.map((m) => [m.membershipId, String(m.percent)]),
        ),
      );
      setReason("");
      setError(null);
    }
  }, [open, members]);

  const total = members.reduce(
    (s, m) => s + (Number(percents[m.membershipId]) || 0),
    0,
  );
  const totalOk = Math.round(total * 10000) === 1_000_000;

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Request a new split</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <DialogContentText>
            Set every member&apos;s share, yours included. The total must be
            exactly 100%.
          </DialogContentText>
          {error && <Alert severity="error">{error}</Alert>}
          {members.map((m) => (
            <Stack
              key={m.membershipId}
              direction="row"
              spacing={1}
              alignItems="center"
            >
              <Typography sx={{ flex: 1, fontSize: 14 }}>
                {m.name}
                {m.isMe ? " (you)" : ""}
              </Typography>
              <TextField
                size="small"
                type="number"
                value={percents[m.membershipId] ?? ""}
                onChange={(e) =>
                  setPercents({ ...percents, [m.membershipId]: e.target.value })
                }
                inputProps={{
                  min: 0,
                  max: 100,
                  step: "0.0001",
                  "aria-label": `${m.name} percent`,
                }}
                sx={{ width: 120 }}
              />
            </Stack>
          ))}
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 650,
              color: totalOk ? "success.main" : "error.main",
            }}
          >
            Total {Number(total.toFixed(4))}% {totalOk ? "" : "(must be 100%)"}
          </Typography>
          <TextField
            size="small"
            label="Reason (optional)"
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={busy || !totalOk}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSubmit(
                members.map((m) => ({
                  membershipId: m.membershipId,
                  percent: Number(percents[m.membershipId]) || 0,
                })),
                reason.trim(),
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to submit");
            } finally {
              setBusy(false);
            }
          }}
        >
          Send request
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** One % field per member, for the add and remove requests. */
function SplitFields({
  members,
  percents,
  onChange,
}: {
  members: GuildView["members"];
  percents: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <>
      {members.map((m) => (
        <Stack
          key={m.membershipId}
          direction="row"
          spacing={1}
          alignItems="center"
        >
          <Typography sx={{ flex: 1, fontSize: 14 }}>
            {m.name}
            {m.isMe ? " (you)" : ""}
          </Typography>
          <TextField
            size="small"
            type="number"
            value={percents[m.membershipId] ?? ""}
            onChange={(e) =>
              onChange({ ...percents, [m.membershipId]: e.target.value })
            }
            inputProps={{
              min: 0,
              max: 100,
              step: "0.0001",
              "aria-label": `${m.name} percent`,
            }}
            sx={{ width: 120 }}
          />
        </Stack>
      ))}
    </>
  );
}

function TotalLine({ total }: { total: number }) {
  const ok = isHundred(total);
  return (
    <Typography
      sx={{
        fontSize: 13,
        fontWeight: 650,
        color: ok ? "success.main" : "error.main",
      }}
    >
      Total {Number(total.toFixed(4))}% {ok ? "" : "(must be 100%)"}
    </Typography>
  );
}

const currentPercents = (members: GuildView["members"]) =>
  Object.fromEntries(members.map((m) => [m.membershipId, String(m.percent)]));

const toLines = (
  members: GuildView["members"],
  percents: Record<string, string>,
): SplitLine[] =>
  members.map((m) => ({
    membershipId: m.membershipId,
    percent: Number(percents[m.membershipId]) || 0,
  }));

function AddMemberRequestDialog({
  open,
  members,
  onClose,
  onSubmit,
}: {
  open: boolean;
  members: GuildView["members"];
  onClose: () => void;
  onSubmit: (
    person: {
      name: string;
      email: string;
      phoneNumber: string | null;
      percent: number;
      walletAddress: string | null;
    },
    lines: SplitLine[],
    reason: string,
  ) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [percent, setPercent] = useState("");
  const [wallet, setWallet] = useState("");
  const [percents, setPercents] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setPhone("");
      setPercent("");
      setWallet("");
      setPercents(currentPercents(members));
      setReason("");
      setError(null);
    }
  }, [open, members]);

  const total =
    (Number(percent) || 0) +
    members.reduce((s, m) => s + (Number(percents[m.membershipId]) || 0), 0);

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Request to add a member</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <DialogContentText>
            Our team confirms the request with you, then approves it. Only then
            is their account created and a temporary password emailed to them.
            The next payout waits 24 hours after that.
          </DialogContentText>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            size="small"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            size="small"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            size="small"
            label="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <TextField
            size="small"
            label="Their reward %"
            type="number"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            inputProps={{ min: 0, max: 100, step: "0.0001" }}
          />
          <TextField
            size="small"
            label="Reward wallet (optional)"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            helperText="A Bitcoin address. It can also be requested later."
          />
          <Typography sx={{ fontSize: 13, fontWeight: 650, pt: 1 }}>
            Current members&apos; new percentages
          </Typography>
          <SplitFields
            members={members}
            percents={percents}
            onChange={setPercents}
          />
          <TotalLine total={total} />
          <TextField
            size="small"
            label="Reason (optional)"
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={
            busy ||
            !name.trim() ||
            !email.trim() ||
            percent === "" ||
            !isHundred(total)
          }
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSubmit(
                {
                  name: name.trim(),
                  email: email.trim(),
                  phoneNumber: phone.trim() || null,
                  percent: Number(percent),
                  walletAddress: wallet.trim() || null,
                },
                toLines(members, percents),
                reason.trim(),
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to submit");
            } finally {
              setBusy(false);
            }
          }}
        >
          Send request
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RemoveMemberRequestDialog({
  open,
  members,
  onClose,
  onSubmit,
}: {
  open: boolean;
  members: GuildView["members"];
  onClose: () => void;
  onSubmit: (
    membershipId: string,
    lines: SplitLine[],
    reason: string,
  ) => Promise<void>;
}) {
  const [membershipId, setMembershipId] = useState("");
  const [percents, setPercents] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMembershipId("");
      setPercents(currentPercents(members));
      setReason("");
      setError(null);
    }
  }, [open, members]);

  const removable = members.filter((m) => !m.isGuildmaster);
  const staying = members.filter((m) => m.membershipId !== membershipId);
  const total = staying.reduce(
    (s, m) => s + (Number(percents[m.membershipId]) || 0),
    0,
  );

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Request to remove a member</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <DialogContentText>
            Once our team has confirmed and approved it, the member leaves the
            guild and their account is closed. The next payout waits 24 hours
            after that.
          </DialogContentText>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            select
            size="small"
            label="Member to remove"
            value={membershipId}
            onChange={(e) => setMembershipId(e.target.value)}
          >
            {removable.map((m) => (
              <MenuItem key={m.membershipId} value={m.membershipId}>
                {m.name}
              </MenuItem>
            ))}
          </TextField>
          {membershipId && (
            <>
              <Typography sx={{ fontSize: 13, fontWeight: 650, pt: 1 }}>
                Remaining members&apos; new percentages
              </Typography>
              <SplitFields
                members={staying}
                percents={percents}
                onChange={setPercents}
              />
              <TotalLine total={total} />
            </>
          )}
          <TextField
            size="small"
            label="Reason (optional)"
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={busy || !membershipId || !isHundred(total)}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSubmit(
                membershipId,
                toLines(staying, percents),
                reason.trim(),
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to submit");
            } finally {
              setBusy(false);
            }
          }}
        >
          Send request
        </Button>
      </DialogActions>
    </Dialog>
  );
}
