"use client";

import { can } from "@/lib/auth/can";
/**
 * Access Rules (SUPER_ADMIN only): office hours and the office-passkey rule
 * for ADMIN and ACCOUNTING accounts, live extra time and requests for it,
 * emergency exceptions, and holidays. Logic: src/lib/auth/staffAccess.ts.
 * All times are office time (Asia/Karachi).
 */
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import { useUser } from "@/lib/hooks";
import {
  MAX_PASSKEY_EXEMPT_DAYS,
  OFFICE_TIME_ZONE,
  emptyWeeklyHours,
  officeDate,
  officeTimeToDate,
  type DayKey,
  type WeeklyHours,
} from "@/lib/auth/staffAccess";

// ---------------------------------------------------------------------------
// Types (GET /api/admin/staff-access)
// ---------------------------------------------------------------------------

type Rule = {
  hoursEnabled: boolean;
  weeklyHours: WeeklyHours;
  graceMinutes: number;
  requireDeviceBoundPasskey: boolean;
  passkeyExemptUntil: string | null;
  passkeyExemptNote: string | null;
};
type Account = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  rule: Rule | null;
  live: {
    allowed: boolean;
    phase: string;
    accessUntil: string | null;
    scheduledEnd: string | null;
    graceEnd: string | null;
  } | null;
  passkeys: {
    id: string;
    name: string | null;
    builtIn: boolean;
    known: boolean;
    deviceType: string | null;
    attachment: string | null;
    lastUsedAt: string | null;
  }[];
  windows: {
    id: string;
    startsAt: string;
    endsAt: string;
    note: string | null;
  }[];
  holidays: { id: string; date: string; name: string }[];
};
type TimeRequest = {
  id: string;
  minutesRequested: number;
  note: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
};
type Overview = {
  accounts: Account[];
  requests: TimeRequest[];
  officeHolidays: { id: string; date: string; name: string }[];
};

const DAY_LABELS: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};
/** Account types shown in the Account type column. */
const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  ACCOUNTING: "Accounting",
  SUPER_ADMIN: "Super admin",
};
const WEEK_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const officeDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: OFFICE_TIME_ZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const officeClock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: OFFICE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });

/** "2026-11-18T14:30" typed as office time -> ISO instant. */
const officeInputToIso = (value: string) => {
  const [ymd, hhmm] = value.split("T");
  return officeTimeToDate(ymd, hhmm).toISOString();
};

/** An instant as an office-time value for <input type="datetime-local">. */
const isoToOfficeInput = (date: Date) =>
  `${officeDate(date)}T${date.toLocaleTimeString("en-GB", {
    timeZone: OFFICE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  })}`;

const who = (a: { name: string | null; email: string }) => a.name || a.email;

function hoursSummary(rule: Rule | null): string {
  if (!rule?.hoursEnabled) return "No limit";
  const on = WEEK_ORDER.filter((d) => rule.weeklyHours[d]);
  if (on.length === 0) return "No days set";
  const first = rule.weeklyHours[on[0]]!;
  const same = on.every(
    (d) =>
      rule.weeklyHours[d]!.start === first.start &&
      rule.weeklyHours[d]!.end === first.end,
  );
  const days = on.map((d) => DAY_LABELS[d].slice(0, 3)).join(", ");
  return same ? `${days} ${first.start}–${first.end}` : `${days} (varies)`;
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as { message?: string };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AccessRulesPage() {
  const ds = useDaylightAdminSx();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const isSuperAdmin = can(user, "access_rules.view");

  const { data, isLoading, error } = useQuery<Overview>({
    queryKey: ["staff-access"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const res = await fetch("/api/admin/staff-access", {
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load access rules");
      return body;
    },
    refetchInterval: 30_000,
  });

  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const [addingTime, setAddingTime] = useState<{
    account: Account;
    request?: TimeRequest;
  } | null>(null);
  const [emergency, setEmergency] = useState<Account | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["staff-access"] });
  // `onError`: a dialog passes its own setter so the error shows inside the
  // dialog, not on the page behind it.
  const run = async (
    fn: () => Promise<{ message?: string }>,
    fallback: string,
    onError?: (message: string | null) => void,
  ) => {
    const showError = onError ?? setActionError;
    showError(null);
    setNotice(null);
    try {
      const result = await fn();
      setNotice(result.message || fallback);
      await refresh();
      return true;
    } catch (err) {
      showError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    }
  };

  if (user && !isSuperAdmin) {
    return (
      <DaylightAdminPage>
        <DaylightPageHeader title="Access Rules" />
        <Alert severity="error" sx={ds.alertSx("error")}>
          Only a super admin can manage access rules.
        </Alert>
      </DaylightAdminPage>
    );
  }

  const accountById = new Map(data?.accounts.map((a) => [a.id, a]) ?? []);

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Access Rules"
        description={
          <>
            Limit admin and accounting accounts to set working hours and to the
            passkey built into their office computer. All times are office time
            (Pakistan, UTC+05). Changes to hours reach open sessions within 30
            seconds; turning the passkey rule on signs the account out.
          </>
        }
      />

      {notice && (
        <Alert
          severity="success"
          sx={{ mb: 2, ...ds.alertSx("success") }}
          onClose={() => setNotice(null)}
        >
          {notice}
        </Alert>
      )}
      {actionError && (
        <Alert
          severity="error"
          sx={{ mb: 2, ...ds.alertSx("error") }}
          onClose={() => setActionError(null)}
        >
          {actionError}
        </Alert>
      )}

      {isLoading || !user ? (
        <DaylightLoading />
      ) : error ? (
        <Alert severity="error" sx={ds.alertSx("error")}>
          {error instanceof Error ? error.message : "Failed to load"}
        </Alert>
      ) : data ? (
        <Stack spacing={3}>
          {data.requests.length > 0 && (
            <Box>
              <Typography component="h2" sx={{ ...ds.sectionTitleSx, mb: 1.5 }}>
                Requests for more time
              </Typography>
              <TableContainer
                component={Paper}
                variant="outlined"
                sx={ds.tableCardSx}
              >
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Person</TableCell>
                      <TableCell>Asked for</TableCell>
                      <TableCell>Note</TableCell>
                      <TableCell>Sent</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.requests.map((r) => {
                      const account = accountById.get(r.user.id);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            {who(r.user)}
                            <CellNote>
                              {account?.live?.accessUntil
                                ? `Access ends ${officeClock(account.live.accessUntil)}`
                                : "Outside allowed time"}
                            </CellNote>
                          </TableCell>
                          <TableCell>{r.minutesRequested} min</TableCell>
                          <TableCell sx={{ maxWidth: 260 }}>
                            {r.note || "—"}
                          </TableCell>
                          <TableCell>{officeDateTime(r.createdAt)}</TableCell>
                          <TableCell align="right">
                            <Stack
                              direction="row"
                              spacing={1}
                              justifyContent="flex-end"
                            >
                              <Button
                                size="small"
                                variant="contained"
                                sx={ds.successBtnSx}
                                disabled={!account}
                                onClick={() =>
                                  account &&
                                  setAddingTime({ account, request: r })
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                sx={ds.dangerOutlineBtnSx}
                                onClick={() =>
                                  run(
                                    () =>
                                      send(
                                        `/api/admin/staff-access/${r.user.id}/time`,
                                        "POST",
                                        {
                                          requestId: r.id,
                                          decline: true,
                                        },
                                      ),
                                    "Request declined",
                                  )
                                }
                              >
                                Decline
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          <Box>
            <Typography component="h2" sx={{ ...ds.sectionTitleSx, mb: 1.5 }}>
              Admin and accounting accounts
            </Typography>
            {data.accounts.length === 0 ? (
              <DaylightEmptyState>
                No admin or accounting accounts.
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
                      <TableCell>Account</TableCell>
                      <TableCell>Account type</TableCell>
                      <TableCell>Working hours</TableCell>
                      <TableCell>Office passkey</TableCell>
                      <TableCell>Right now</TableCell>
                      <TableCell>Exceptions</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.accounts.map((a) => (
                      <AccountRow
                        key={a.id}
                        account={a}
                        onEdit={() => setEditing(a)}
                        onAddTime={() => setAddingTime({ account: a })}
                        onEmergency={() => setEmergency(a)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>

          <HolidaysCard
            holidays={data.officeHolidays}
            onAdd={(date, name) =>
              run(
                () =>
                  send("/api/admin/staff-access/holidays", "POST", {
                    date,
                    name,
                  }),
                "Holiday added",
              )
            }
            onRemove={(id) =>
              run(
                () =>
                  send(`/api/admin/staff-access/holidays?id=${id}`, "DELETE"),
                "Holiday removed",
              )
            }
          />
        </Stack>
      ) : null}

      {editing && (
        <EditRulesDialog
          account={accountById.get(editing.id) ?? editing}
          onClose={() => setEditing(null)}
          run={run}
        />
      )}
      {addingTime && (
        <AddTimeDialog
          account={addingTime.account}
          request={addingTime.request}
          onClose={() => setAddingTime(null)}
          run={run}
        />
      )}
      {emergency && (
        <EmergencyDialog
          account={emergency}
          onClose={() => setEmergency(null)}
          run={run}
        />
      )}
    </DaylightAdminPage>
  );
}

type Run = (
  fn: () => Promise<{ message?: string }>,
  fallback: string,
  onError?: (message: string | null) => void,
) => Promise<boolean>;

/** Errors from a dialog's actions, shown at the top of that dialog. */
function useDialogRun(run: Run) {
  const [error, setError] = useState<string | null>(null);
  const runHere: Run = (fn, fallback) => run(fn, fallback, setError);
  return { error, setError, runHere };
}

function DialogError({ error }: { error: string | null }) {
  return error ? (
    <Alert severity="error" sx={{ mb: 2 }}>
      {error}
    </Alert>
  ) : null;
}

// ---------------------------------------------------------------------------
// Rows and cards
// ---------------------------------------------------------------------------

function AccountRow({
  account: a,
  onEdit,
  onAddTime,
  onEmergency,
}: {
  account: Account;
  onEdit: () => void;
  onAddTime: () => void;
  onEmergency: () => void;
}) {
  const ds = useDaylightAdminSx();
  const builtIn = a.passkeys.filter((p) => p.builtIn).length;
  const exemptActive =
    a.rule?.passkeyExemptUntil &&
    new Date(a.rule.passkeyExemptUntil) > new Date();
  const live = a.live;

  return (
    <TableRow>
      <TableCell>
        {who(a)}
        <CellNote>{a.email}</CellNote>
      </TableCell>
      <TableCell>
        <DaylightStatusPill
          label={ROLE_LABELS[a.role] ?? a.role}
          tone={a.role === "ACCOUNTING" ? "info" : "neutral"}
        />
      </TableCell>
      <TableCell>
        {hoursSummary(a.rule)}
        {a.rule?.hoursEnabled && a.rule.graceMinutes > 0 && (
          <CellNote>{a.rule.graceMinutes} min grace</CellNote>
        )}
      </TableCell>
      <TableCell>
        {a.rule?.requireDeviceBoundPasskey ? (
          <DaylightStatusPill label="Required" tone="info" />
        ) : (
          <DaylightStatusPill label="Off" tone="neutral" />
        )}
        <CellNote>
          {builtIn} built-in passkey{builtIn === 1 ? "" : "s"} of{" "}
          {a.passkeys.length}
        </CellNote>
      </TableCell>
      <TableCell>
        {!a.rule?.hoursEnabled ? (
          "—"
        ) : live?.allowed ? (
          <>
            <DaylightStatusPill
              label={
                live.phase === "grace"
                  ? "Grace"
                  : live.phase === "extra"
                    ? "Extra time"
                    : "Working hours"
              }
              tone={live.phase === "normal" ? "success" : "warning"}
            />
            {live.accessUntil && (
              <CellNote>until {officeClock(live.accessUntil)}</CellNote>
            )}
          </>
        ) : (
          <DaylightStatusPill label="Outside hours" tone="neutral" />
        )}
      </TableCell>
      <TableCell>
        {exemptActive && (
          <CellNote>
            Passkey exception until{" "}
            {officeDateTime(a.rule!.passkeyExemptUntil!)}
          </CellNote>
        )}
        {a.windows.map((w) => (
          <CellNote key={w.id}>
            Hours {officeDateTime(w.startsAt)} – {officeDateTime(w.endsAt)}
          </CellNote>
        ))}
        {!exemptActive && a.windows.length === 0 && "—"}
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          <Button size="small" sx={ds.textBtnSx("action")} onClick={onEdit}>
            Edit rules
          </Button>
          {a.rule?.hoursEnabled && (
            <Button
              size="small"
              sx={ds.textBtnSx("success")}
              onClick={onAddTime}
            >
              Add time
            </Button>
          )}
          {(a.rule?.hoursEnabled || a.rule?.requireDeviceBoundPasskey) && (
            <Button
              size="small"
              sx={ds.textBtnSx("danger")}
              onClick={onEmergency}
            >
              Emergency access
            </Button>
          )}
        </Stack>
      </TableCell>
    </TableRow>
  );
}

function HolidaysCard({
  holidays,
  onAdd,
  onRemove,
  title = "Office holidays",
  hint = "On these days everyone with working hours is blocked all day, unless they have a one-off hours exception.",
}: {
  holidays: { id: string; date: string; name: string }[];
  onAdd: (date: string, name: string) => Promise<boolean>;
  onRemove: (id: string) => void;
  title?: string;
  hint?: string;
}) {
  const ds = useDaylightAdminSx();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  return (
    <Box sx={ds.cardSx}>
      <Typography component="h2" sx={ds.sectionTitleSx}>
        {title}
      </Typography>
      <Typography sx={{ ...ds.pageDescSx, mb: 2 }}>{hint}</Typography>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ mb: 2, ...ds.inputSx }}
      >
        <TextField
          id={`holiday-date-${title}`}
          type="date"
          size="small"
          label="Date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          id={`holiday-name-${title}`}
          size="small"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          inputProps={{ maxLength: 120 }}
        />
        <Button
          variant="contained"
          sx={ds.primaryBtnSx}
          disabled={!date || !name.trim()}
          onClick={async () => {
            if (await onAdd(date, name.trim())) {
              setDate("");
              setName("");
            }
          }}
        >
          Add day off
        </Button>
      </Stack>
      {holidays.length === 0 ? (
        <Typography sx={ds.pageDescSx}>None coming up.</Typography>
      ) : (
        <Stack spacing={0.5}>
          {holidays.map((h) => (
            <Stack key={h.id} direction="row" alignItems="center" spacing={1}>
              <Typography sx={{ fontSize: 13, minWidth: 110 }}>
                {h.date}
              </Typography>
              <Typography sx={{ fontSize: 13, flex: 1 }}>{h.name}</Typography>
              <Button
                size="small"
                sx={ds.textBtnSx("danger")}
                onClick={() => onRemove(h.id)}
              >
                Remove
              </Button>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function EditRulesDialog({
  account,
  onClose,
  run,
}: {
  account: Account;
  onClose: () => void;
  run: Run;
}) {
  const ds = useDaylightAdminSx();
  const rule = account.rule;
  const [hoursEnabled, setHoursEnabled] = useState(rule?.hoursEnabled ?? false);
  const [hours, setHours] = useState<WeeklyHours>(
    rule?.weeklyHours ?? emptyWeeklyHours(),
  );
  const [grace, setGrace] = useState(String(rule?.graceMinutes ?? 0));
  const [requirePasskey, setRequirePasskey] = useState(
    rule?.requireDeviceBoundPasskey ?? false,
  );
  const [saving, setSaving] = useState(false);
  const { error, setError, runHere } = useDialogRun(run);
  const builtIn = account.passkeys.filter((p) => p.builtIn).length;

  const setDay = (day: DayKey, value: WeeklyHours[DayKey]) =>
    setHours((h) => ({ ...h, [day]: value }));

  const save = async () => {
    if (hoursEnabled && WEEK_ORDER.every((d) => !hours[d])) {
      setError(
        'Tick at least one working day, or turn off "Limit to working hours".',
      );
      return;
    }
    setSaving(true);
    const ok = await runHere(
      () =>
        send(`/api/admin/staff-access/${account.id}`, "PUT", {
          hoursEnabled,
          weeklyHours: hours,
          graceMinutes: Number(grace) || 0,
          requireDeviceBoundPasskey: requirePasskey,
        }),
      "Access rules saved",
    );
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Access rules: {who(account)}</DialogTitle>
      <DialogContent>
        <DialogError error={error} />
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <Box>
            <FormControlLabel
              control={
                <Switch
                  id="rule-hours-enabled"
                  checked={hoursEnabled}
                  onChange={(e) => setHoursEnabled(e.target.checked)}
                />
              }
              label="Limit to working hours"
            />
            {hoursEnabled && (
              <Stack spacing={1} sx={{ mt: 1, pl: 1 }}>
                {WEEK_ORDER.map((day) => {
                  const value = hours[day];
                  return (
                    <Stack
                      key={day}
                      direction="row"
                      spacing={1.5}
                      alignItems="center"
                      flexWrap="wrap"
                    >
                      <FormControlLabel
                        sx={{ minWidth: 140 }}
                        control={
                          <Checkbox
                            id={`rule-day-${day}`}
                            checked={!!value}
                            onChange={(e) =>
                              setDay(
                                day,
                                e.target.checked
                                  ? { start: "10:00", end: "18:00" }
                                  : null,
                              )
                            }
                          />
                        }
                        label={DAY_LABELS[day]}
                      />
                      {value ? (
                        <>
                          <TextField
                            id={`rule-start-${day}`}
                            type="time"
                            size="small"
                            label="From"
                            value={value.start}
                            onChange={(e) =>
                              setDay(day, { ...value, start: e.target.value })
                            }
                            InputLabelProps={{ shrink: true }}
                          />
                          <TextField
                            id={`rule-end-${day}`}
                            type="time"
                            size="small"
                            label="To"
                            value={value.end}
                            onChange={(e) =>
                              setDay(day, { ...value, end: e.target.value })
                            }
                            InputLabelProps={{ shrink: true }}
                          />
                        </>
                      ) : (
                        <Typography
                          sx={{ fontSize: 13, color: "text.secondary" }}
                        >
                          Day off
                        </Typography>
                      )}
                    </Stack>
                  );
                })}
                <TextField
                  id="rule-grace"
                  type="number"
                  size="small"
                  label="Grace period (minutes)"
                  value={grace}
                  onChange={(e) => setGrace(e.target.value)}
                  inputProps={{ min: 0, max: 240 }}
                  helperText="After the end time they get this much more, and can still sign in during it."
                  sx={{ maxWidth: 320, mt: 1 }}
                />
              </Stack>
            )}
          </Box>

          <Divider />

          <Box>
            <FormControlLabel
              control={
                <Switch
                  id="rule-require-passkey"
                  checked={requirePasskey}
                  onChange={(e) => setRequirePasskey(e.target.checked)}
                />
              }
              label="Sign in only with the passkey built into their office computer"
            />
            <Typography sx={{ ...ds.pageDescSx, pl: 1 }}>
              Password and 2FA sign-in stop working, and they can no longer add
              or remove passkeys themselves. Before turning this on, have them
              sign in on the office PC, add a passkey there (Windows Hello), and
              sign in once with it.
              {!rule?.requireDeviceBoundPasskey &&
                requirePasskey &&
                builtIn === 0 && (
                  <Box
                    component="span"
                    sx={{ display: "block", color: "error.main", mt: 0.5 }}
                  >
                    This account has no built-in passkey yet, so saving will be
                    refused.
                  </Box>
                )}
            </Typography>
            <Box sx={{ mt: 1.5, pl: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>
                Passkeys
              </Typography>
              {account.passkeys.length === 0 ? (
                <Typography sx={ds.pageDescSx}>None registered.</Typography>
              ) : (
                account.passkeys.map((p) => (
                  <Stack
                    key={p.id}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ py: 0.25 }}
                  >
                    <Typography sx={{ fontSize: 13, flex: 1 }}>
                      {p.name || "Passkey"}
                      {p.lastUsedAt && (
                        <Box component="span" sx={{ color: "text.secondary" }}>
                          {" "}
                          · last used {officeDateTime(p.lastUsedAt)}
                        </Box>
                      )}
                    </Typography>
                    <DaylightStatusPill
                      label={
                        p.builtIn
                          ? "Built-in"
                          : !p.known
                            ? "Unknown: sign in once with it"
                            : p.deviceType === "multiDevice"
                              ? "Synced, not allowed"
                              : "Security key, not allowed"
                      }
                      tone={
                        p.builtIn ? "success" : p.known ? "danger" : "warning"
                      }
                    />
                    <Button
                      size="small"
                      sx={ds.textBtnSx("danger")}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove the passkey "${p.name || "Passkey"}" from ${who(account)}? They will be signed out.`,
                          )
                        ) {
                          runHere(
                            () =>
                              send(
                                `/api/admin/staff-access/${account.id}/passkeys/${p.id}`,
                                "DELETE",
                              ),
                            "Passkey removed",
                          );
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </Stack>
                ))
              )}
            </Box>
          </Box>

          <Divider />

          <HolidaysCard
            title="Their own days off"
            hint="Days off for this account only, on top of office holidays."
            holidays={account.holidays}
            onAdd={(date, name) =>
              runHere(
                () =>
                  send("/api/admin/staff-access/holidays", "POST", {
                    date,
                    name,
                    userId: account.id,
                  }),
                "Day off added",
              )
            }
            onRemove={(id) =>
              runHere(
                () =>
                  send(`/api/admin/staff-access/holidays?id=${id}`, "DELETE"),
                "Day off removed",
              )
            }
          />

          {account.windows.length > 0 && (
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>
                Hours exceptions
              </Typography>
              {account.windows.map((w) => (
                <Stack
                  key={w.id}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                >
                  <Typography sx={{ fontSize: 13, flex: 1 }}>
                    {officeDateTime(w.startsAt)} – {officeDateTime(w.endsAt)}
                    {w.note ? ` · ${w.note}` : ""}
                  </Typography>
                  <Button
                    size="small"
                    sx={ds.textBtnSx("danger")}
                    onClick={() =>
                      runHere(
                        () =>
                          send(
                            `/api/admin/staff-access/${account.id}/windows?id=${w.id}`,
                            "DELETE",
                          ),
                        "Exception removed",
                      )
                    }
                  >
                    Remove
                  </Button>
                </Stack>
              ))}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Close
        </Button>
        <Button variant="contained" onClick={save} disabled={saving}>
          Save rules
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AddTimeDialog({
  account,
  request,
  onClose,
  run,
}: {
  account: Account;
  request?: TimeRequest;
  onClose: () => void;
  run: Run;
}) {
  const [minutes, setMinutes] = useState(
    String(request?.minutesRequested ?? 15),
  );
  const [saving, setSaving] = useState(false);
  const { error, runHere } = useDialogRun(run);
  const until = account.live?.allowed ? account.live.accessUntil : null;

  const save = async () => {
    setSaving(true);
    const ok = await runHere(
      () =>
        send(`/api/admin/staff-access/${account.id}/time`, "POST", {
          minutes: Number(minutes),
          requestId: request?.id,
        }),
      "Time added",
    );
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add time: {who(account)}</DialogTitle>
      <DialogContent>
        <DialogError error={error} />
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography sx={{ fontSize: 13 }}>
            {until
              ? `Their access now ends at ${officeClock(until)}. The time is added after that.`
              : "They are outside their allowed time now. The time starts now."}{" "}
            They see a message within 30 seconds.
          </Typography>
          {request?.note && (
            <Alert severity="info">Their note: {request.note}</Alert>
          )}
          <TextField
            id="add-time-minutes"
            type="number"
            label="Minutes"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            inputProps={{ min: 1, max: 480 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || !(Number(minutes) > 0)}
        >
          {request ? "Approve and add" : "Add time"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function EmergencyDialog({
  account,
  onClose,
  run,
}: {
  account: Account;
  onClose: () => void;
  run: Run;
}) {
  const ds = useDaylightAdminSx();
  const rule = account.rule;
  const now = new Date();
  const inHours = (h: number) =>
    isoToOfficeInput(new Date(now.getTime() + h * 3_600_000));

  const [hoursOn, setHoursOn] = useState(!!rule?.hoursEnabled);
  const [hoursFrom, setHoursFrom] = useState(isoToOfficeInput(now));
  const [hoursTo, setHoursTo] = useState(inHours(4));
  const [passkeyOn, setPasskeyOn] = useState(!!rule?.requireDeviceBoundPasskey);
  const [passkeyUntil, setPasskeyUntil] = useState(inHours(4));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const { error, runHere } = useDialogRun(run);

  const exemptActive =
    rule?.passkeyExemptUntil && new Date(rule.passkeyExemptUntil) > new Date();

  const save = async () => {
    setSaving(true);
    const ok = await runHere(async () => {
      const done: string[] = [];
      if (hoursOn && rule?.hoursEnabled) {
        await send(`/api/admin/staff-access/${account.id}/windows`, "POST", {
          startsAt: officeInputToIso(hoursFrom),
          endsAt: officeInputToIso(hoursTo),
          note: note || undefined,
        });
        done.push("hours exception added");
      }
      if (passkeyOn && rule?.requireDeviceBoundPasskey) {
        await send(
          `/api/admin/staff-access/${account.id}/passkey-exception`,
          "POST",
          {
            until: officeInputToIso(passkeyUntil),
            note: note || undefined,
          },
        );
        done.push("passkey exception set");
      }
      return {
        message: done.length ? `Saved: ${done.join(", ")}.` : "Nothing to save",
      };
    }, "Saved");
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Emergency access: {who(account)}</DialogTitle>
      <DialogContent>
        <DialogError error={error} />
        <Stack spacing={2.5} sx={{ mt: 1, ...ds.inputSx }}>
          <Typography sx={{ fontSize: 13 }}>
            Office time (Pakistan). The two exceptions are separate: to let
            someone work from home at night, set both.
          </Typography>

          {rule?.hoursEnabled && (
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    id="emergency-hours"
                    checked={hoursOn}
                    onChange={(e) => setHoursOn(e.target.checked)}
                  />
                }
                label="Allow working outside their hours"
              />
              {hoursOn && (
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  sx={{ mt: 1 }}
                >
                  <TextField
                    id="emergency-hours-from"
                    type="datetime-local"
                    size="small"
                    label="From"
                    value={hoursFrom}
                    onChange={(e) => setHoursFrom(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    id="emergency-hours-to"
                    type="datetime-local"
                    size="small"
                    label="Until"
                    value={hoursTo}
                    onChange={(e) => setHoursTo(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Stack>
              )}
            </Box>
          )}

          {rule?.requireDeviceBoundPasskey && (
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    id="emergency-passkey"
                    checked={passkeyOn}
                    onChange={(e) => setPasskeyOn(e.target.checked)}
                  />
                }
                label="Allow sign-in without the office passkey (password + 2FA)"
              />
              {exemptActive && (
                <Alert
                  severity="warning"
                  sx={{ mt: 1 }}
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      onClick={async () => {
                        if (
                          await runHere(
                            () =>
                              send(
                                `/api/admin/staff-access/${account.id}/passkey-exception`,
                                "DELETE",
                              ),
                            "Exception ended",
                          )
                        )
                          onClose();
                      }}
                    >
                      End now
                    </Button>
                  }
                >
                  Already allowed until{" "}
                  {officeDateTime(rule.passkeyExemptUntil!)}. Ending it signs
                  them out.
                </Alert>
              )}
              {passkeyOn && (
                <Stack
                  direction="row"
                  spacing={1.5}
                  sx={{ mt: 1 }}
                  alignItems="center"
                  flexWrap="wrap"
                >
                  <TextField
                    id="emergency-passkey-until"
                    type="datetime-local"
                    size="small"
                    label="Until"
                    value={passkeyUntil}
                    onChange={(e) => setPasskeyUntil(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    helperText={`At most ${MAX_PASSKEY_EXEMPT_DAYS} days ahead`}
                  />
                  <TextField
                    id="emergency-passkey-quick"
                    select
                    size="small"
                    label="Quick pick"
                    value=""
                    onChange={(e) =>
                      setPasskeyUntil(inHours(Number(e.target.value)))
                    }
                    sx={{ minWidth: 140 }}
                  >
                    {[2, 4, 8, 24, 72, 168].map((h) => (
                      <MenuItem key={h} value={h}>
                        {h < 24
                          ? `${h} hours`
                          : `${h / 24} day${h === 24 ? "" : "s"}`}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
              )}
            </Box>
          )}

          <TextField
            id="emergency-note"
            size="small"
            label="Reason (saved in the audit log)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            inputProps={{ maxLength: 500 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={save}
          disabled={saving || (!hoursOn && !passkeyOn)}
        >
          Allow
        </Button>
      </DialogActions>
    </Dialog>
  );
}
