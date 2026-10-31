"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
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
import MultisigSignDialog from "@/components/guilds/MultisigSignDialog";
import {
  distributionStatusLabel,
  distributionTone,
  formatBtc,
  formatMonth,
  formatUsd,
  previousMonthKey,
} from "@/lib/guilds/format";
import { payoutTxUrl } from "@/lib/guilds/walletNetworks";

interface Member {
  id: string;
  userId: string;
  isGuildmaster: boolean;
  rewardPercent: string;
  walletAddress: string | null;
  walletUpdatedAt: string | null;
  carriedBtc: string;
  leftAt: string | null;
  user: { id: string; name: string | null; email: string };
}

interface Distribution {
  id: string;
  rewardMonth: string;
  status: string;
  holdReason: string | null;
  luxorPayoutBtc: string;
  btcUsdRate: string;
  hostingDueUsd: string;
  companyBtc: string;
  companyUsd: string;
  netBtc: string;
  shortfallUsd: string;
  networkFeeBtc: string;
  settledAt: string | null;
  payoutBatch: {
    id: string;
    method: string;
    status: string;
    txid: string | null;
    confirmations: number;
    createdBy: { name: string | null; email: string } | null;
    confirmedAt: string | null;
  } | null;
  lines: {
    id: string;
    nameSnapshot: string;
    isGuildmaster: boolean;
    percentSnapshot: string;
    walletSnapshot: string | null;
    networkSnapshot: string;
    btcAmount: string;
    carriedInBtc: string;
    paidBtc: string;
    carriedOutBtc: string;
    carryReason: string | null;
  }[];
}

interface GuildDetail {
  id: string;
  name: string;
  isActive: boolean;
  guildmaster: { id: string; name: string | null; email: string };
  poolAuth: { authKey: string } | null;
  payoutAddress: string | null;
  payoutAddressIndex: number | null;
  payoutMethod: string | null;
  payoutSettings: {
    defaultPayoutMethod: string;
    minPayoutSats: number;
    availableMethods: string[];
  };
  multisig: {
    enabled: boolean;
    network: "mainnet" | "testnet";
    walletNetwork: string;
    walletReady: boolean;
    receiveAddress: string | null;
    changeAddress: string | null;
    receiveKeys: { xpub: string; branch: number; index: number }[];
    walletKeys: { fingerprint: string; originPath: string; xpub: string }[];
    appKeyFingerprint: string | null;
    coins: {
      txid: string;
      vout: number;
      sats: number;
      branch: number;
      source: string;
      status: string;
    }[];
  };
  memberships: Member[];
  distributions: Distribution[];
  walletChangeRequests: { id: string }[];
  splitChangeRequests: { id: string }[];
  memberChangeRequests: { id: string }[];
  hostingInvoices: {
    invoiceId: string;
    invoiceNumber: string;
    unpaidUsd: number;
    reserved: { rewardMonth: string; amountUsd: number }[];
    outstandingUsd: number;
  }[];
}

const memberName = (m: Member) => m.user.name || m.user.email;

async function postJson(url: string, body: unknown, method = "POST") {
  return fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return body.error || fallback;
}

export default function GuildDetailPage() {
  const { id } = useParams<{ id: string }>();
  const ds = useDaylightAdminSx();
  const { withStepUp, stepUpDialog } = useStepUp();
  const [guild, setGuild] = useState<GuildDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [handoverTarget, setHandoverTarget] = useState<Member | null>(null);
  const [settleTarget, setSettleTarget] = useState<Distribution | null>(null);
  const [signBatchId, setSignBatchId] = useState<string | null>(null);
  const [runMonth, setRunMonth] = useState(previousMonthKey());
  const [busy, setBusy] = useState(false);
  // Bumped on every reload, so the change history refreshes after an action.
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/guilds/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(await readError(res, "Failed to load"));
      setGuild((await res.json()).data);
      setReloadKey((k) => k + 1);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the guild");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<Response>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fn();
      if (!res.ok)
        throw new Error(await readError(res, "Something went wrong"));
      setNotice(done);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <DaylightAdminPage>
        <DaylightLoading />
      </DaylightAdminPage>
    );
  }
  if (!guild) {
    return (
      <DaylightAdminPage>
        <Alert severity="error" sx={ds.alertSx("error")}>
          {error ?? "Guild not found"}
        </Alert>
      </DaylightAdminPage>
    );
  }

  const active = guild.memberships.filter((m) => !m.leftAt);
  // Not yet reserved by any distribution; reserved amounts show per invoice.
  const owed = guild.hostingInvoices.reduce((s, i) => s + i.outstandingUsd, 0);
  const openRequests =
    guild.walletChangeRequests.length +
    guild.splitChangeRequests.length +
    guild.memberChangeRequests.length;

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title={guild.name}
        description={
          <>
            <Link href="/guilds">All guilds</Link> · Guildmaster{" "}
            {guild.guildmaster.name || guild.guildmaster.email} · Subaccount{" "}
            {guild.poolAuth?.authKey ?? "none"}
          </>
        }
        actions={
          <FormControlLabel
            control={
              <Switch
                checked={guild.isActive}
                disabled={busy}
                onChange={(e) =>
                  act(
                    () =>
                      postJson(
                        `/api/guilds/${guild.id}`,
                        { isActive: e.target.checked },
                        "PATCH",
                      ),
                    e.target.checked ? "Guild activated" : "Guild deactivated",
                  )
                }
              />
            }
            label={guild.isActive ? "Active" : "Inactive"}
          />
        }
      />

      <Stack spacing={3}>
        {error && (
          <Alert
            severity="error"
            sx={ds.alertSx("error")}
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}
        {notice && (
          <Alert
            severity="success"
            sx={ds.alertSx("success")}
            onClose={() => setNotice(null)}
          >
            {notice}
          </Alert>
        )}
        {openRequests > 0 && (
          <Alert severity="info" sx={ds.alertSx("info")}>
            {openRequests} change request(s) from the Guildmaster waiting for
            review. <Link href="/guild-requests">Review them</Link>
          </Alert>
        )}

        {/* Members */}
        <Box>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 1 }}
          >
            <Typography component="h2" sx={{ fontWeight: 650, fontSize: 16 }}>
              Members
            </Typography>
            <Button
              variant="outlined"
              sx={ds.outlineBtnSx}
              onClick={() => {
                setError(null);
                setAddOpen(true);
              }}
            >
              Add member
            </Button>
          </Stack>
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={ds.tableCardSx}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Member</TableCell>
                  <TableCell align="right">Reward %</TableCell>
                  <TableCell>Reward wallet</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {active.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      {memberName(m)}
                      <CellNote>
                        {m.isGuildmaster ? "Guildmaster · " : ""}
                        {m.user.email}
                      </CellNote>
                    </TableCell>
                    <TableCell align="right">
                      {Number(m.rewardPercent)}%
                    </TableCell>
                    <TableCell sx={{ "&&&": { maxWidth: 280 } }}>
                      <Box
                        sx={{
                          fontFamily: "monospace",
                          fontSize: 12,
                          wordBreak: "break-all",
                        }}
                      >
                        {m.walletAddress ?? "Not set"}
                      </Box>
                      {m.walletUpdatedAt && (
                        <CellNote>
                          Set {new Date(m.walletUpdatedAt).toLocaleString()}
                        </CellNote>
                      )}
                      {Number(m.carriedBtc) > 0 && (
                        <CellNote>
                          {formatBtc(m.carriedBtc)} carried to next payout
                        </CellNote>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {!m.isGuildmaster && (
                        <Stack
                          direction="column"
                          spacing={1}
                          alignItems="flex-end"
                        >
                          <Button
                            size="small"
                            variant="outlined"
                            sx={ds.outlineBtnSx}
                            disabled={busy}
                            onClick={() => setHandoverTarget(m)}
                          >
                            Make Guildmaster
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            sx={ds.dangerOutlineBtnSx}
                            disabled={busy}
                            onClick={() => {
                              setError(null);
                              setRemoveTarget(m);
                            }}
                          >
                            Remove
                          </Button>
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>
            Wallet, split and member changes come from the Guildmaster as
            requests. A split you set here while adding or removing a member
            takes effect straight away, and the next distribution waits 24
            hours.
          </Typography>
        </Box>

        <PayoutSetup
          guild={guild}
          busy={busy}
          onSave={(body, done) =>
            act(() => postJson(`/api/guilds/${guild.id}`, body, "PATCH"), done)
          }
          onSwitchToMultisig={() => {
            if (
              !window.confirm(
                `Switch ${guild.name} to multisig payouts? It gets its own address from the payout wallet, and this can't be undone here.`,
              )
            )
              return;
            act(
              () =>
                withStepUp((creds) =>
                  postJson(`/api/guilds/${guild.id}/multisig`, creds),
                ),
              "Switched to multisig - check the address with Show on Trezor, then set it as the Luxor payout address",
            );
          }}
        />

        {/* Hosting owed */}
        <Box>
          <Typography
            component="h2"
            sx={{ fontWeight: 650, fontSize: 16, mb: 1 }}
          >
            Hosting owed: {owed > 0 ? formatUsd(owed) : "nothing"}
          </Typography>
          {guild.hostingInvoices.length > 0 && (
            <Stack spacing={0.5}>
              {guild.hostingInvoices.map((i) => (
                <Typography key={i.invoiceId} sx={{ fontSize: 13 }}>
                  <Link href={`/accounting/${i.invoiceId}`}>
                    {i.invoiceNumber}
                  </Link>{" "}
                  — {formatUsd(i.unpaidUsd)} unpaid
                  {i.reserved.map(
                    (r) =>
                      `, ${formatUsd(r.amountUsd)} reserved by ${formatMonth(r.rewardMonth)} (not sent yet)`,
                  )}
                </Typography>
              ))}
            </Stack>
          )}
        </Box>

        {/* Distributions */}
        <Box>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
            spacing={1}
            sx={{ mb: 1 }}
          >
            <Typography component="h2" sx={{ fontWeight: 650, fontSize: 16 }}>
              Monthly distributions
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                size="small"
                type="month"
                label="Reward month"
                value={runMonth}
                onChange={(e) => setRunMonth(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={ds.inputSx}
              />
              <Button
                variant="contained"
                sx={ds.primaryBtnSx}
                disabled={busy || !runMonth}
                onClick={() =>
                  act(
                    () =>
                      postJson(`/api/guilds/${guild.id}/distributions`, {
                        rewardMonth: runMonth,
                      }),
                    `Distribution for ${formatMonth(`${runMonth}-01T00:00:00Z`)} calculated`,
                  )
                }
              >
                Calculate
              </Button>
            </Stack>
          </Stack>

          {guild.distributions.length === 0 ? (
            <DaylightEmptyState>
              No distributions yet. The daily job calculates one once
              Luxor&apos;s monthly payout for the guild shows up; you can also
              calculate it here.
            </DaylightEmptyState>
          ) : (
            <Stack spacing={2}>
              {guild.distributions.map((d) => (
                <Paper
                  key={d.id}
                  variant="outlined"
                  sx={{ ...ds.cardSx, p: 2 }}
                >
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    justifyContent="space-between"
                    spacing={1}
                  >
                    <Box>
                      <Typography sx={{ fontWeight: 650 }}>
                        {formatMonth(d.rewardMonth)} reward
                      </Typography>
                      <Typography
                        sx={{ fontSize: 13, color: "text.secondary" }}
                      >
                        Luxor paid {formatBtc(d.luxorPayoutBtc)} · BTC at{" "}
                        {formatUsd(Number(d.btcUsdRate))}
                      </Typography>
                    </Box>
                    <Box>
                      <DaylightStatusPill
                        label={distributionStatusLabel(d.status)}
                        tone={distributionTone(d.status)}
                      />
                    </Box>
                  </Stack>
                  {d.holdReason && (
                    <Alert
                      severity="warning"
                      sx={{ ...ds.alertSx("warning"), mt: 1 }}
                    >
                      {d.holdReason}
                    </Alert>
                  )}
                  <Box
                    sx={{
                      display: "grid",
                      gap: 1,
                      mt: 1.5,
                      gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
                      fontSize: 13,
                    }}
                  >
                    <Box>
                      Hosting owed
                      <CellNote>{formatUsd(Number(d.hostingDueUsd))}</CellNote>
                    </Box>
                    <Box>
                      To company wallet
                      <CellNote>
                        {formatBtc(d.companyBtc)} (
                        {formatUsd(Number(d.companyUsd))})
                      </CellNote>
                    </Box>
                    <Box>
                      Split between members
                      <CellNote>{formatBtc(d.netBtc)}</CellNote>
                    </Box>
                  </Box>
                  {Number(d.shortfallUsd) > 0 && (
                    <Alert
                      severity="error"
                      sx={{ ...ds.alertSx("error"), mt: 1 }}
                    >
                      The reward didn&apos;t cover hosting:{" "}
                      {formatUsd(Number(d.shortfallUsd))} still owed, taken
                      first from next month&apos;s reward.
                    </Alert>
                  )}
                  <Table size="small" sx={{ mt: 1 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Member</TableCell>
                        <TableCell align="right">%</TableCell>
                        <TableCell align="right">Share</TableCell>
                        <TableCell align="right">Carried in</TableCell>
                        <TableCell align="right">Send</TableCell>
                        <TableCell align="right">Carried out</TableCell>
                        <TableCell>Wallet</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {d.lines.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>
                            {l.nameSnapshot}
                            {l.isGuildmaster && (
                              <CellNote>Guildmaster</CellNote>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            {Number(l.percentSnapshot)}%
                          </TableCell>
                          <TableCell align="right">
                            {formatBtc(l.btcAmount)}
                          </TableCell>
                          <TableCell align="right">
                            {Number(l.carriedInBtc) > 0
                              ? formatBtc(l.carriedInBtc)
                              : "—"}
                          </TableCell>
                          <TableCell align="right">
                            <strong>{formatBtc(l.paidBtc)}</strong>
                          </TableCell>
                          <TableCell align="right">
                            {Number(l.carriedOutBtc) > 0
                              ? formatBtc(l.carriedOutBtc)
                              : "—"}
                            {l.carryReason && (
                              <CellNote>{l.carryReason}</CellNote>
                            )}
                          </TableCell>
                          <TableCell>
                            <Box
                              sx={{
                                fontFamily: "monospace",
                                fontSize: 12,
                                wordBreak: "break-all",
                              }}
                            >
                              {l.walletSnapshot ?? "Not set"}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {d.payoutBatch?.status === "AWAITING_SIGNATURE" ? (
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      sx={{ mt: 1.5 }}
                      justifyContent="space-between"
                      alignItems={{ sm: "center" }}
                    >
                      <Typography sx={{ fontSize: 13 }}>
                        Prepared and signed by the app key
                        {d.payoutBatch.createdBy &&
                          ` (${d.payoutBatch.createdBy.name || d.payoutBatch.createdBy.email})`}
                        {d.payoutBatch.txid
                          ? " · signed, waiting to be seen on the network"
                          : " · waiting for the approver's Trezor"}
                      </Typography>
                      <Button
                        variant="contained"
                        sx={ds.successBtnSx}
                        disabled={busy}
                        onClick={() => setSignBatchId(d.payoutBatch!.id)}
                      >
                        Review and sign
                      </Button>
                    </Stack>
                  ) : d.payoutBatch ? (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ mt: 1 }}
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Typography
                        sx={{ fontSize: 12, color: "text.secondary" }}
                      >
                        {d.status === "SETTLED" ? "Sent" : "Sending"}
                        {d.settledAt &&
                          ` ${new Date(d.settledAt).toLocaleString()}`}
                        {d.payoutBatch.createdBy &&
                          ` by ${d.payoutBatch.createdBy.name || d.payoutBatch.createdBy.email}`}
                        {" · "}
                        {payoutTxUrl(
                          d.payoutBatch.txid,
                          d.payoutBatch.method === "MULTISIG_BTC"
                            ? guild.multisig.walletNetwork
                            : undefined,
                        ) ? (
                          <a
                            href={payoutTxUrl(
                              d.payoutBatch.txid,
                              d.payoutBatch.method === "MULTISIG_BTC"
                                ? guild.multisig.walletNetwork
                                : undefined,
                            )!}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View transaction
                          </a>
                        ) : (
                          `Ref ${d.payoutBatch.txid}`
                        )}
                        {d.status === "BROADCAST" &&
                          ` · ${d.payoutBatch.confirmations} confirmation(s)`}
                      </Typography>
                      {d.status === "BROADCAST" &&
                        d.payoutBatch.method === "MULTISIG_BTC" && (
                          <Button
                            size="small"
                            variant="outlined"
                            sx={ds.outlineBtnSx}
                            disabled={busy}
                            onClick={() =>
                              act(
                                () =>
                                  postJson("/api/guilds/multisig-payouts", {
                                    action: "check",
                                  }),
                                "Checked - it settles once it has enough confirmations",
                              )
                            }
                          >
                            Check now
                          </Button>
                        )}
                    </Stack>
                  ) : (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ mt: 1.5 }}
                      justifyContent="flex-end"
                    >
                      <Button
                        variant="outlined"
                        sx={ds.outlineBtnSx}
                        disabled={
                          busy || !["CALCULATED", "HELD"].includes(d.status)
                        }
                        onClick={() =>
                          act(
                            () =>
                              postJson(
                                `/api/guilds/${guild.id}/distributions`,
                                {
                                  rewardMonth: d.rewardMonth.slice(0, 7),
                                },
                              ),
                            "Recalculated at today's BTC price",
                          )
                        }
                      >
                        Recalculate
                      </Button>
                      {guild.payoutAddressIndex !== null ? (
                        <Button
                          variant="contained"
                          sx={ds.successBtnSx}
                          disabled={busy || d.status !== "CALCULATED"}
                          onClick={() =>
                            act(
                              () =>
                                withStepUp((creds) =>
                                  postJson("/api/guilds/multisig-payouts", {
                                    action: "prepare",
                                    distributionId: d.id,
                                    ...creds,
                                  }),
                                ),
                              "Payout prepared and signed by the app key - review and sign it with the Trezor",
                            )
                          }
                        >
                          Prepare payout
                        </Button>
                      ) : (
                        <Button
                          variant="contained"
                          sx={ds.successBtnSx}
                          disabled={busy || d.status !== "CALCULATED"}
                          onClick={() => setSettleTarget(d)}
                        >
                          Mark as sent
                        </Button>
                      )}
                    </Stack>
                  )}
                </Paper>
              ))}
            </Stack>
          )}
        </Box>

        <GuildHistory guildId={guild.id} reloadKey={reloadKey} />
      </Stack>

      <SplitDialog
        open={addOpen}
        title="Add member"
        members={active}
        withNewPerson
        busy={busy}
        error={error}
        onClose={() => setAddOpen(false)}
        onSubmit={async (split, person) => {
          const ok = await act(
            () =>
              postJson(`/api/guilds/${guild.id}/members`, { person, split }),
            `${person?.email} added - they've been emailed a temporary password`,
          );
          if (ok) setAddOpen(false);
        }}
      />
      <SplitDialog
        open={!!removeTarget}
        title={removeTarget ? `Remove ${memberName(removeTarget)}` : ""}
        intro="Their account will be closed. Set the remaining members' percentages:"
        members={active.filter((m) => m.id !== removeTarget?.id)}
        busy={busy}
        error={error}
        onClose={() => setRemoveTarget(null)}
        onSubmit={async (split) => {
          if (!removeTarget) return;
          const ok = await act(
            () =>
              postJson(
                `/api/guilds/${guild.id}/members/${removeTarget.id}`,
                { split },
                "DELETE",
              ),
            `${memberName(removeTarget)} removed`,
          );
          if (ok) setRemoveTarget(null);
        }}
      />

      <Dialog open={!!handoverTarget} onClose={() => setHandoverTarget(null)}>
        <DialogTitle>
          Make {handoverTarget && memberName(handoverTarget)} Guildmaster?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            The guild&apos;s miners, Luxor subaccount, invoices and balance move
            to their account, and they become the point of contact.{" "}
            {guild.guildmaster.name || guild.guildmaster.email} stays in the
            guild as a member with the same percentage. Both are signed out so
            their new access takes effect.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHandoverTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            sx={ds.primaryBtnSx}
            disabled={busy}
            onClick={async () => {
              if (!handoverTarget) return;
              const ok = await act(
                () =>
                  withStepUp((creds) =>
                    postJson(`/api/guilds/${guild.id}/handover`, {
                      membershipId: handoverTarget.id,
                      ...creds,
                    }),
                  ),
                `${memberName(handoverTarget)} is now the Guildmaster`,
              );
              if (ok) setHandoverTarget(null);
            }}
          >
            Hand over
          </Button>
        </DialogActions>
      </Dialog>

      <SettleDialog
        distribution={settleTarget}
        busy={busy}
        onClose={() => setSettleTarget(null)}
        onSubmit={async (reference) => {
          if (!settleTarget) return;
          const ok = await act(
            () =>
              withStepUp((creds) =>
                postJson("/api/guilds/payout-batches", {
                  distributionIds: [settleTarget.id],
                  reference,
                  ...creds,
                }),
              ),
            "Recorded as sent - hosting paid and members emailed",
          );
          if (ok) setSettleTarget(null);
        }}
      />
      <MultisigSignDialog
        batchId={signBatchId}
        withStepUp={withStepUp}
        onClose={() => setSignBatchId(null)}
        onDone={async (message) => {
          setSignBatchId(null);
          setError(null);
          setNotice(message);
          await load();
        }}
      />
      {stepUpDialog}
    </DaylightAdminPage>
  );
}

interface NewPerson {
  name: string;
  email: string;
  phoneNumber: string | null;
  percent: number;
  walletAddress: string | null;
}

/** Edits every listed member's percentage (plus an optional new person). */
function SplitDialog({
  open,
  title,
  intro,
  members,
  withNewPerson = false,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  intro?: string;
  members: Member[];
  withNewPerson?: boolean;
  busy: boolean;
  /** Shown inside the dialog - the page's own alert sits behind it. */
  error?: string | null;
  onClose: () => void;
  onSubmit: (
    split: { membershipId: string; percent: number }[],
    person?: NewPerson,
  ) => void;
}) {
  const ds = useDaylightAdminSx();
  const [percents, setPercents] = useState<Record<string, string>>({});
  const [person, setPerson] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    percent: "",
    walletAddress: "",
  });

  useEffect(() => {
    if (open) {
      setPercents(
        Object.fromEntries(
          members.map((m) => [m.id, String(Number(m.rewardPercent))]),
        ),
      );
      setPerson({
        name: "",
        email: "",
        phoneNumber: "",
        percent: "",
        walletAddress: "",
      });
    }
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const total =
    members.reduce((s, m) => s + (Number(percents[m.id]) || 0), 0) +
    (withNewPerson ? Number(person.percent) || 0 : 0);
  const totalOk = Math.round(total * 10000) === 1_000_000;

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {intro && <DialogContentText>{intro}</DialogContentText>}
          {withNewPerson && (
            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              }}
            >
              <TextField
                size="small"
                label="Name"
                value={person.name}
                onChange={(e) => setPerson({ ...person, name: e.target.value })}
                sx={ds.inputSx}
              />
              <TextField
                size="small"
                label="Email"
                value={person.email}
                onChange={(e) =>
                  setPerson({ ...person, email: e.target.value })
                }
                sx={ds.inputSx}
              />
              <TextField
                size="small"
                label="Phone (optional)"
                value={person.phoneNumber}
                onChange={(e) =>
                  setPerson({ ...person, phoneNumber: e.target.value })
                }
                sx={ds.inputSx}
              />
              <TextField
                size="small"
                label="Their reward %"
                type="number"
                value={person.percent}
                onChange={(e) =>
                  setPerson({ ...person, percent: e.target.value })
                }
                sx={ds.inputSx}
              />
              <TextField
                size="small"
                label="Reward wallet (optional)"
                value={person.walletAddress}
                onChange={(e) =>
                  setPerson({ ...person, walletAddress: e.target.value })
                }
                sx={{ ...ds.inputSx, gridColumn: { sm: "1 / -1" } }}
              />
            </Box>
          )}
          {withNewPerson && (
            <Typography sx={{ fontSize: 13, fontWeight: 650 }}>
              Current members&apos; new percentages
            </Typography>
          )}
          {members.map((m) => (
            <Stack key={m.id} direction="row" spacing={1} alignItems="center">
              <Typography sx={{ flex: 1, fontSize: 13 }}>
                {memberName(m)}
                {m.isGuildmaster ? " (Guildmaster)" : ""}
              </Typography>
              <TextField
                size="small"
                type="number"
                value={percents[m.id] ?? ""}
                onChange={(e) =>
                  setPercents({ ...percents, [m.id]: e.target.value })
                }
                inputProps={{
                  min: 0,
                  max: 100,
                  step: "0.0001",
                  "aria-label": `${memberName(m)} percent`,
                }}
                sx={{ ...ds.inputSx, width: 120 }}
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
          {error && (
            <Alert severity="error" sx={ds.alertSx("error")}>
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          sx={ds.primaryBtnSx}
          disabled={busy || !totalOk}
          onClick={() =>
            onSubmit(
              members.map((m) => ({
                membershipId: m.id,
                percent: Number(percents[m.id]) || 0,
              })),
              withNewPerson
                ? {
                    name: person.name,
                    email: person.email,
                    phoneNumber: person.phoneNumber || null,
                    percent: Number(person.percent) || 0,
                    walletAddress: person.walletAddress || null,
                  }
                : undefined,
            )
          }
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SettleDialog({
  distribution,
  busy,
  onClose,
  onSubmit,
}: {
  distribution: Distribution | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (ref: string) => void;
}) {
  const ds = useDaylightAdminSx();
  const [ref, setRef] = useState("");
  useEffect(() => setRef(""), [distribution]);
  return (
    <Dialog
      open={!!distribution}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>
        Mark {distribution && formatMonth(distribution.rewardMonth)} as sent
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <DialogContentText>
            Send exactly these amounts, ideally in one transaction, then record
            its transaction id. This records the hosting payment, moves carried
            balances on and emails every member.
          </DialogContentText>
          {distribution && (
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell>Company wallet (hosting)</TableCell>
                  <TableCell align="right">
                    {formatBtc(
                      Number(distribution.companyBtc) -
                        Number(distribution.networkFeeBtc),
                    )}
                  </TableCell>
                </TableRow>
                {distribution.lines
                  .filter((l) => Number(l.paidBtc) > 0)
                  .map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        {l.nameSnapshot}
                        <Box
                          sx={{
                            fontFamily: "monospace",
                            fontSize: 11,
                            wordBreak: "break-all",
                          }}
                        >
                          {l.walletSnapshot}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        {formatBtc(l.paidBtc)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
          <TextField
            size="small"
            label="Transaction id"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            sx={ds.inputSx}
            autoFocus
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          sx={ds.successBtnSx}
          disabled={busy || !ref.trim()}
          onClick={() => onSubmit(ref.trim())}
        >
          Mark as sent
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const METHOD_LABELS: Record<string, string> = {
  MANUAL: "Manual (admin sends the BTC)",
  MULTISIG_BTC: "Automatic multisig BTC",
};

/** The guild's receiving address (set it on Luxor) and how it's paid. */
function PayoutSetup({
  guild,
  busy,
  onSave,
  onSwitchToMultisig,
}: {
  guild: GuildDetail;
  busy: boolean;
  onSave: (body: Record<string, unknown>, done: string) => void;
  onSwitchToMultisig: () => void;
}) {
  const ds = useDaylightAdminSx();
  const [address, setAddress] = useState(guild.payoutAddress ?? "");
  useEffect(() => setAddress(guild.payoutAddress ?? ""), [guild.payoutAddress]);
  const { defaultPayoutMethod, availableMethods } = guild.payoutSettings;

  if (guild.payoutAddressIndex !== null) {
    return <MultisigPayoutBox guild={guild} />;
  }

  return (
    <Box>
      <Typography component="h2" sx={{ fontWeight: 650, fontSize: 16, mb: 1 }}>
        Payout
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", md: "2fr auto 1fr" },
          alignItems: "start",
        }}
      >
        <TextField
          size="small"
          label="Guild receiving address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          helperText="This guild's own address: set it as the payout address of its Luxor subaccount, and Luxor pays the whole monthly reward here. From it you send the hosting share to the company wallet (Payout settings on Guilds) and each member's share to their wallet."
          sx={ds.inputSx}
        />
        <Button
          variant="outlined"
          sx={ds.outlineBtnSx}
          disabled={busy || address.trim() === (guild.payoutAddress ?? "")}
          onClick={() =>
            onSave(
              { payoutAddress: address.trim() || null },
              "Receiving address saved - set it on Luxor too",
            )
          }
        >
          Save address
        </Button>
        <TextField
          select
          size="small"
          label="Payout method"
          value={guild.payoutMethod ?? ""}
          disabled={busy}
          onChange={(e) =>
            onSave(
              { payoutMethod: e.target.value || null },
              "Payout method saved",
            )
          }
          sx={ds.inputSx}
        >
          <MenuItem value="">
            Default: {METHOD_LABELS[defaultPayoutMethod] ?? defaultPayoutMethod}
          </MenuItem>
          {Object.entries(METHOD_LABELS).map(([value, label]) => (
            <MenuItem
              key={value}
              value={value}
              // Multisig is chosen with Switch to multisig, below.
              disabled={
                value === "MULTISIG_BTC" || !availableMethods.includes(value)
              }
            >
              {label}
              {!availableMethods.includes(value)
                ? " (coming soon)"
                : value === "MULTISIG_BTC"
                  ? " (use Switch to multisig)"
                  : ""}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      {guild.multisig.enabled && (
        <Alert severity="info" sx={{ ...ds.alertSx("info"), mt: 1.5 }}>
          {guild.multisig.walletReady ? (
            <>
              Multisig payouts ({guild.multisig.network}) are available.
              Switching gives this guild its own address from the 2-of-3 wallet;
              set it on Luxor afterwards. It needs every distribution sent
              first, and anything carried for members must be sent to the
              guild&apos;s change address before the first multisig payout.{" "}
              <Button
                size="small"
                variant="outlined"
                sx={ds.outlineBtnSx}
                disabled={busy}
                onClick={onSwitchToMultisig}
              >
                Switch to multisig
              </Button>
            </>
          ) : (
            "Multisig payouts are switched on, but the payout wallet isn't set up yet (Guilds page → Multisig payout wallet)."
          )}
        </Alert>
      )}
    </Box>
  );
}

/** A multisig guild's two addresses and the coins at them. */
function MultisigPayoutBox({ guild }: { guild: GuildDetail }) {
  const ds = useDaylightAdminSx();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const m = guild.multisig;
  const mono = {
    fontFamily: "monospace",
    fontSize: 12,
    wordBreak: "break-all",
  };
  const sum = (
    filter: (c: GuildDetail["multisig"]["coins"][number]) => boolean,
  ) => m.coins.filter(filter).reduce((s, c) => s + c.sats, 0) / 1e8;

  const showOnTrezor = async () => {
    setMessage(null);
    try {
      const client = await import("@/lib/guilds/multisig/trezorClient");
      const originPath = m.walletKeys[0]?.originPath;
      if (!originPath) throw new Error("The wallet isn't set up");
      const device = await client.readTrezorKey({
        network: m.network,
        originPath,
      });
      const mine = m.walletKeys.find(
        (k) =>
          k.fingerprint !== m.appKeyFingerprint &&
          k.fingerprint === device.fingerprint,
      );
      if (!mine) throw new Error("This Trezor holds none of the wallet's keys");
      const shown = await client.showAddressOnTrezor({
        network: m.network,
        keys: m.walletKeys,
        approverFingerprint: mine.fingerprint,
        sortedKeys: m.receiveKeys,
        branch: 0,
        index: guild.payoutAddressIndex!,
      });
      setMessage(
        shown === m.receiveAddress
          ? { ok: true, text: `The Trezor derived the same address: ${shown}` }
          : {
              ok: false,
              text: `The Trezor derived a DIFFERENT address: ${shown}. Don't use this address.`,
            },
      );
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof Error ? e.message : "Couldn't reach the Trezor",
      });
    }
  };

  return (
    <Box>
      <Typography component="h2" sx={{ fontWeight: 650, fontSize: 16, mb: 1 }}>
        Payout: multisig ({m.network})
      </Typography>
      {message && (
        <Alert
          severity={message.ok ? "success" : "error"}
          sx={{ ...ds.alertSx(message.ok ? "success" : "error"), mb: 1 }}
          onClose={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ ...ds.cardSx, p: 2 }}>
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            fontSize: 13,
          }}
        >
          <Box>
            Receiving address (set it on Luxor)
            <Box sx={mono}>{m.receiveAddress ?? guild.payoutAddress}</Box>
            <CellNote>Luxor pays the monthly reward here.</CellNote>
          </Box>
          <Box>
            Change address
            <Box sx={mono}>{m.changeAddress ?? "—"}</Box>
            <CellNote>
              Holds what&apos;s carried for members between payouts.
            </CellNote>
          </Box>
          <Box>
            Available
            <CellNote>
              {formatBtc(sum((c) => c.status === "AVAILABLE"))}
              {sum((c) => c.status === "UNCONFIRMED") > 0 &&
                ` · ${formatBtc(sum((c) => c.status === "UNCONFIRMED"))} confirming`}
              {sum((c) => c.status === "RESERVED") > 0 &&
                ` · ${formatBtc(sum((c) => c.status === "RESERVED"))} in a prepared payout`}
            </CellNote>
          </Box>
          <Box>
            <Button
              size="small"
              variant="outlined"
              sx={ds.outlineBtnSx}
              onClick={showOnTrezor}
            >
              Show on Trezor
            </Button>
            <CellNote>
              Checks the receiving address on the device before you set it on
              Luxor.
            </CellNote>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}

interface HistoryEvent {
  id: string;
  at: string;
  source: "request" | "admin";
  title: string;
  by: { name: string | null; email: string } | null;
  status?: string;
  details: string[];
}

/**
 * Who changed what in this guild: every Guildmaster request step (requested,
 * confirmed, approved or rejected) and every direct admin change.
 */
function GuildHistory({
  guildId,
  reloadKey,
}: {
  guildId: string;
  reloadKey: number;
}) {
  const ds = useDaylightAdminSx();
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/guilds/${guildId}/history`, {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(await readError(res, "Failed to load the history"));
        }
        const body = await res.json();
        if (!cancelled) {
          setEvents(body.data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load the history",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId, reloadKey]);

  return (
    <Box>
      <Typography component="h2" sx={{ fontWeight: 650, fontSize: 16, mb: 1 }}>
        Change history
      </Typography>
      {error ? (
        <Alert severity="error" sx={ds.alertSx("error")}>
          {error}
        </Alert>
      ) : events === null ? (
        <DaylightLoading />
      ) : events.length === 0 ? (
        <DaylightEmptyState>No changes yet.</DaylightEmptyState>
      ) : (
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={ds.tableCardSx}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>Change</TableCell>
                <TableCell>By</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {new Date(e.at).toLocaleDateString()}
                    <CellNote>
                      {new Date(e.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </CellNote>
                  </TableCell>
                  <TableCell sx={{ "&&&": { minWidth: 260, maxWidth: 520 } }}>
                    {e.title}
                    {e.details.map((line, i) => (
                      <CellNote key={i}>
                        <Box component="span" sx={{ wordBreak: "break-all" }}>
                          {line}
                        </Box>
                      </CellNote>
                    ))}
                  </TableCell>
                  <TableCell>
                    {e.by ? e.by.name || e.by.email : "—"}
                    {e.by?.name && <CellNote>{e.by.email}</CellNote>}
                  </TableCell>
                  <TableCell>
                    {e.status ? (
                      <DaylightStatusPill
                        label={statusLabel(e.status)}
                        tone={requestStatusTone(e.status)}
                      />
                    ) : (
                      <DaylightStatusPill
                        label="Done by admin"
                        tone="neutral"
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
