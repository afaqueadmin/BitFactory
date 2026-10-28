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
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  CellNote,
  DaylightAdminPage,
  DaylightEmptyState,
  DaylightLoading,
  DaylightPageHeader,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import {
  distributionStatusLabel,
  distributionTone,
  formatBtc,
  formatMonth,
  formatUsd,
} from "@/lib/guilds/format";
import { useStepUp } from "@/components/StepUpDialog";
import { payoutTxUrl } from "@/lib/guilds/walletNetworks";

interface GuildRow {
  id: string;
  name: string;
  isActive: boolean;
  guildmaster: { id: string; name: string | null; email: string };
  subaccountName: string | null;
  memberCount: number;
  hostingOwedUsd: number;
  latestDistribution: {
    id: string;
    rewardMonth: string;
    status: string;
    shortfallUsd: string;
  } | null;
}

interface PersonForm {
  name: string;
  email: string;
  phoneNumber: string;
  percent: string;
  walletAddress: string;
}

const emptyPerson = (): PersonForm => ({
  name: "",
  email: "",
  phoneNumber: "",
  percent: "",
  walletAddress: "",
});

export default function GuildsPage() {
  const ds = useDaylightAdminSx();
  const [guilds, setGuilds] = useState<GuildRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/guilds", { credentials: "include" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load guilds");
      setGuilds(body.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load guilds");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Guilds"
        description="Groups that jointly own the miners in one Luxor subaccount. Luxor pays each guild monthly to a Higgs wallet; the reward pays the guild's hosting first, then is split by each member's percentage."
        actions={
          <Button
            variant="contained"
            sx={ds.primaryBtnSx}
            onClick={() => setCreateOpen(true)}
          >
            Create guild
          </Button>
        }
      />

      {loading ? (
        <DaylightLoading />
      ) : error ? (
        <Alert severity="error" sx={ds.alertSx("error")}>
          {error}
        </Alert>
      ) : guilds.length === 0 ? (
        <DaylightEmptyState>
          No guilds yet. Create one to set up its Guildmaster and members.
        </DaylightEmptyState>
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
                <TableCell>Guildmaster</TableCell>
                <TableCell>Subaccount</TableCell>
                <TableCell align="right">Members</TableCell>
                <TableCell align="right">Hosting owed</TableCell>
                <TableCell>Latest distribution</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {guilds.map((g) => (
                <TableRow key={g.id} hover>
                  <TableCell>
                    <Link href={`/guilds/${g.id}`}>{g.name}</Link>
                    {!g.isActive && <CellNote>Inactive</CellNote>}
                  </TableCell>
                  <TableCell>
                    {g.guildmaster.name || g.guildmaster.email}
                    <CellNote>{g.guildmaster.email}</CellNote>
                  </TableCell>
                  <TableCell>{g.subaccountName ?? "—"}</TableCell>
                  <TableCell align="right">{g.memberCount}</TableCell>
                  <TableCell align="right">
                    {g.hostingOwedUsd > 0 ? formatUsd(g.hostingOwedUsd) : "—"}
                  </TableCell>
                  <TableCell>
                    {g.latestDistribution ? (
                      <>
                        <DaylightStatusPill
                          label={distributionStatusLabel(
                            g.latestDistribution.status,
                          )}
                          tone={distributionTone(g.latestDistribution.status)}
                        />
                        <CellNote>
                          {formatMonth(g.latestDistribution.rewardMonth)}
                          {Number(g.latestDistribution.shortfallUsd) > 0 &&
                            ` · ${formatUsd(Number(g.latestDistribution.shortfallUsd))} short`}
                        </CellNote>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <SendPayoutsPanel onSent={load} />
      <PayoutSettingsCard />

      <CreateGuildDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
      />
    </DaylightAdminPage>
  );
}

function PersonFields({
  value,
  onChange,
  onRemove,
  title,
}: {
  value: PersonForm;
  onChange: (next: PersonForm) => void;
  onRemove?: () => void;
  title: string;
}) {
  const ds = useDaylightAdminSx();
  const set =
    (key: keyof PersonForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...value, [key]: e.target.value });
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Typography sx={{ fontWeight: 650, fontSize: 13 }}>{title}</Typography>
        {onRemove && (
          <IconButton
            size="small"
            aria-label={`Remove ${title}`}
            onClick={onRemove}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>
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
          value={value.name}
          onChange={set("name")}
          sx={ds.inputSx}
        />
        <TextField
          size="small"
          label="Email"
          type="email"
          value={value.email}
          onChange={set("email")}
          sx={ds.inputSx}
        />
        <TextField
          size="small"
          label="Phone (optional)"
          value={value.phoneNumber}
          onChange={set("phoneNumber")}
          sx={ds.inputSx}
        />
        <TextField
          size="small"
          label="Reward %"
          type="number"
          inputProps={{ min: 0, max: 100, step: "0.0001" }}
          value={value.percent}
          onChange={set("percent")}
          sx={ds.inputSx}
        />
        <TextField
          size="small"
          label="Reward wallet (BTC, optional)"
          value={value.walletAddress}
          onChange={set("walletAddress")}
          sx={{ ...ds.inputSx, gridColumn: { sm: "1 / -1" } }}
          helperText="Distributions wait until every member has a wallet."
        />
      </Box>
    </Box>
  );
}

function CreateGuildDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const ds = useDaylightAdminSx();
  const [name, setName] = useState("");
  const [subaccountName, setSubaccountName] = useState("");
  const [master, setMaster] = useState<PersonForm>(emptyPerson);
  const [members, setMembers] = useState<PersonForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = [master, ...members].reduce(
    (sum, p) => sum + (Number(p.percent) || 0),
    0,
  );
  const totalOk = Math.round(total * 10000) === 1_000_000;

  const reset = () => {
    setName("");
    setSubaccountName("");
    setMaster(emptyPerson());
    setMembers([]);
    setError(null);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    const person = (p: PersonForm) => ({
      name: p.name,
      email: p.email,
      phoneNumber: p.phoneNumber || null,
      percent: Number(p.percent),
      walletAddress: p.walletAddress || null,
    });
    try {
      const res = await fetch("/api/guilds", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          subaccountName,
          master: person(master),
          members: members.map(person),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to create the guild");
      reset();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create the guild");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle>Create guild</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" sx={ds.alertSx("error")}>
              {error}
            </Alert>
          )}
          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            }}
          >
            <TextField
              size="small"
              label="Guild name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              sx={ds.inputSx}
            />
            <TextField
              size="small"
              label="Luxor subaccount"
              value={subaccountName}
              onChange={(e) => setSubaccountName(e.target.value)}
              helperText="Its payout goes monthly to the Higgs wallet."
              sx={ds.inputSx}
            />
          </Box>

          <PersonFields
            title="Guildmaster"
            value={master}
            onChange={setMaster}
          />
          {members.map((m, i) => (
            <PersonFields
              key={i}
              title={`Member ${i + 1}`}
              value={m}
              onChange={(next) =>
                setMembers((list) => list.map((x, j) => (j === i ? next : x)))
              }
              onRemove={() =>
                setMembers((list) => list.filter((_, j) => j !== i))
              }
            />
          ))}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Button
              sx={ds.outlineBtnSx}
              variant="outlined"
              onClick={() => setMembers((l) => [...l, emptyPerson()])}
            >
              Add member
            </Button>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 650,
                color: totalOk ? "success.main" : "error.main",
              }}
            >
              Total {Number(total.toFixed(4))}%{" "}
              {totalOk ? "" : "(must be 100%)"}
            </Typography>
          </Stack>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            Each person gets a welcome email with a temporary password. The
            Guildmaster pays the first hardware and hosting invoice as usual;
            after that, hosting is paid from the monthly reward.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          sx={ds.primaryBtnSx}
          onClick={submit}
          disabled={saving || !totalOk}
        >
          {saving ? "Creating…" : "Create guild"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface PayoutQueue {
  ready: {
    id: string;
    guild: { id: string; name: string };
    rewardMonth: string;
    companyBtc: number;
    paidBtc: number;
  }[];
  companyWalletAddress: string | null;
  companyBtc: number;
  outputs: { address: string; network: string; btc: number; names: string[] }[];
  batches: {
    id: string;
    method: string;
    status: string;
    txid: string | null;
    createdAt: string;
    createdBy: { name: string | null; email: string } | null;
    distributions: { rewardMonth: string; guild: { name: string } }[];
  }[];
}

const monoSx = {
  fontFamily: "monospace",
  fontSize: 12,
  wordBreak: "break-all",
} as const;

/**
 * Every guild distribution ready to send by hand, with exactly what to send
 * (totalled per wallet), recorded as one payout batch.
 */
function SendPayoutsPanel({ onSent }: { onSent: () => void }) {
  const ds = useDaylightAdminSx();
  const { withStepUp, stepUpDialog } = useStepUp();
  const [queue, setQueue] = useState<PayoutQueue | null>(null);
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/guilds/payout-batches", {
      credentials: "include",
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) setQueue(body.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!queue) return null;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await withStepUp((creds) =>
        fetch("/api/guilds/payout-batches", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            distributionIds: queue.ready.map((d) => d.id),
            reference: reference.trim(),
            ...creds,
          }),
        }),
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to record the payout");
      setOpen(false);
      setReference("");
      setNotice("Payout recorded - hosting paid and members emailed");
      await load();
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record the payout");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        spacing={1}
        sx={{ mb: 1 }}
      >
        <Typography component="h2" sx={{ fontWeight: 650, fontSize: 16 }}>
          Payouts to send
        </Typography>
        <Button
          variant="contained"
          sx={ds.successBtnSx}
          disabled={queue.ready.length === 0}
          onClick={() => setOpen(true)}
        >
          Mark all ready as sent
        </Button>
      </Stack>
      {notice && (
        <Alert
          severity="success"
          sx={{ ...ds.alertSx("success"), mb: 1 }}
          onClose={() => setNotice(null)}
        >
          {notice}
        </Alert>
      )}
      {queue.ready.length === 0 ? (
        <DaylightEmptyState>
          Nothing ready to send. Distributions show here once they&apos;re
          calculated and nothing holds them.
        </DaylightEmptyState>
      ) : (
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          {queue.ready
            .map((d) => `${d.guild.name} (${formatMonth(d.rewardMonth)})`)
            .join(", ")}
        </Typography>
      )}

      {queue.batches.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 650, mb: 0.5 }}>
            Recent payouts
          </Typography>
          {queue.batches.map((b) => {
            const url = payoutTxUrl(b.txid);
            return (
              <Typography key={b.id} sx={{ fontSize: 12.5 }}>
                {new Date(b.createdAt).toLocaleDateString()} ·{" "}
                {b.distributions
                  .map((d) => `${d.guild.name} ${formatMonth(d.rewardMonth)}`)
                  .join(", ")}{" "}
                · {b.status.toLowerCase()} ·{" "}
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    transaction
                  </a>
                ) : (
                  `ref ${b.txid ?? "—"}`
                )}
              </Typography>
            );
          })}
        </Box>
      )}

      <Dialog
        open={open}
        onClose={busy ? undefined : () => setOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Send the guild payouts</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {error && (
              <Alert severity="error" sx={ds.alertSx("error")}>
                {error}
              </Alert>
            )}
            <Typography sx={{ fontSize: 13 }}>
              Send exactly these amounts, ideally in one transaction, then
              record its transaction id. Amounts are totalled per wallet across
              guilds.
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>To</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>
                    Company wallet (hosting)
                    <Box sx={monoSx}>
                      {queue.companyWalletAddress ??
                        "Not set - add it in Payout settings"}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    {formatBtc(queue.companyBtc)}
                  </TableCell>
                </TableRow>
                {queue.outputs.map((o) => (
                  <TableRow key={`${o.network}:${o.address}`}>
                    <TableCell>
                      {o.names.join(", ")}
                      <Box sx={monoSx}>{o.address}</Box>
                    </TableCell>
                    <TableCell align="right">{formatBtc(o.btc)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TextField
              size="small"
              label="Transaction id"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              sx={ds.inputSx}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            sx={ds.successBtnSx}
            disabled={busy || !reference.trim()}
            onClick={send}
          >
            Mark as sent
          </Button>
        </DialogActions>
      </Dialog>
      {stepUpDialog}
    </Box>
  );
}

interface PayoutSettingsData {
  feePayer: string;
  minPayoutSats: number;
  minConfirmations: number;
  companyWalletAddress: string | null;
  defaultPayoutMethod: string;
  autoExecute: boolean;
}

const FEE_PAYERS = [
  { value: "HIGGS", label: "Higgs (out of the company output)" },
  {
    value: "HOSTING_SHARE",
    label: "Hosting share (reduces the hosting credit)",
  },
  { value: "GUILD_REWARD", label: "Guild reward (before the split)" },
];

/** GuildPayoutSettings: who pays network fees, minimum payout, etc. */
function PayoutSettingsCard() {
  const ds = useDaylightAdminSx();
  const [form, setForm] = useState<PayoutSettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/guilds/payout-settings", { credentials: "include" })
      .then((res) => res.json())
      .then((body) => body.success && setForm(body.data))
      .catch(() => setError("Failed to load payout settings"));
  }, []);

  if (!form) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/guilds/payout-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feePayer: form.feePayer,
          minPayoutSats: Number(form.minPayoutSats),
          minConfirmations: Number(form.minConfirmations),
          companyWalletAddress: form.companyWalletAddress || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to save");
      setForm(body.data);
      setNotice("Payout settings saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ ...ds.cardSx, p: 2.5, mt: 4 }}>
      <Typography
        component="h2"
        sx={{ fontWeight: 650, fontSize: 16, mb: 1.5 }}
      >
        Payout settings
      </Typography>
      {error && (
        <Alert severity="error" sx={{ ...ds.alertSx("error"), mb: 1.5 }}>
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
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        }}
      >
        <TextField
          select
          size="small"
          label="Network fees paid by"
          value={form.feePayer}
          onChange={(e) => setForm({ ...form, feePayer: e.target.value })}
          sx={ds.inputSx}
        >
          {FEE_PAYERS.map((f) => (
            <MenuItem key={f.value} value={f.value}>
              {f.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          type="number"
          label="Minimum payout (sats)"
          value={form.minPayoutSats}
          onChange={(e) =>
            setForm({ ...form, minPayoutSats: Number(e.target.value) })
          }
          helperText="Smaller amounts are carried to the next month."
          sx={ds.inputSx}
        />
        <TextField
          size="small"
          label="Company wallet (hosting share)"
          value={form.companyWalletAddress ?? ""}
          onChange={(e) =>
            setForm({ ...form, companyWalletAddress: e.target.value })
          }
          sx={ds.inputSx}
        />
        <TextField
          size="small"
          type="number"
          label="Confirmations before a payout counts as done"
          value={form.minConfirmations}
          onChange={(e) =>
            setForm({ ...form, minConfirmations: Number(e.target.value) })
          }
          sx={ds.inputSx}
        />
        <TextField
          size="small"
          label="Payout method"
          value={
            form.defaultPayoutMethod === "MANUAL"
              ? "Manual - automatic multisig coming soon"
              : form.defaultPayoutMethod
          }
          disabled
          sx={ds.inputSx}
        />
        <TextField
          size="small"
          label="Send automatically"
          value={form.autoExecute ? "On" : "Off - available with multisig"}
          disabled
          sx={ds.inputSx}
        />
      </Box>
      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button
          variant="contained"
          sx={ds.primaryBtnSx}
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </Stack>
    </Paper>
  );
}
