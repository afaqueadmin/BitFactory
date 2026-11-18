"use client";

/**
 * Staff access rules, the person's side (src/lib/auth/staffAccess.ts): for an
 * account with working hours, warns before the time runs out, says when the
 * grace period starts and when a super admin added time, and lets the person
 * ask for more. Polls /api/user/access-window every 30 seconds; that call also
 * renews the session cookies when the end time changed. Renders nothing for
 * accounts without an hours limit (204).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";

const POLL_MS = 30_000;
const TICK_MS = 15_000;
const WARN_MS = 10 * 60_000;
const OFFICE_TIME_ZONE = "Asia/Karachi";

type AccessWindow = {
  phase: "unrestricted" | "normal" | "grace" | "extra" | "closed";
  accessUntil: string | null;
  scheduledEnd: string | null;
  graceEnd: string | null;
  graceMinutes: number;
  hoursEnabled: boolean;
  pendingRequest: { id: string; minutesRequested: number } | null;
  lastGrant: {
    id: string;
    minutes: number;
    createdAt: string;
    endsAt: string;
  } | null;
  serverNow: string;
};

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: OFFICE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });

const SEEN_GRANT_KEY = "accessWindow.seenGrant";

function readSeenGrant(): string | null {
  try {
    return sessionStorage.getItem(SEEN_GRANT_KEY);
  } catch {
    return null;
  }
}

function writeSeenGrant(id: string) {
  try {
    sessionStorage.setItem(SEEN_GRANT_KEY, id);
  } catch {
    // Storage blocked: the message just shows again after a reload.
  }
}

export default function AccessWindowBanner() {
  const [data, setData] = useState<AccessWindow | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [stopped, setStopped] = useState(false);
  const [grant, setGrant] = useState<AccessWindow["lastGrant"]>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [minutes, setMinutes] = useState(15);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const redirected = useRef(false);

  const endSession = useCallback(() => {
    if (redirected.current) return;
    redirected.current = true;
    window.location.href = "/login?reason=hours";
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/user/access-window", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 204) {
        setStopped(true);
        return;
      }
      if (res.status === 403) {
        endSession();
        return;
      }
      if (!res.ok) return;
      const body: AccessWindow = await res.json();
      setSkewMs(new Date(body.serverNow).getTime() - Date.now());
      setData(body);
      if (body.phase === "closed" && body.hoursEnabled) endSession();
      if (body.lastGrant && body.lastGrant.id !== readSeenGrant()) {
        setGrant(body.lastGrant);
      }
    } catch {
      // Offline for a moment: try again on the next poll.
    }
  }, [endSession]);

  useEffect(() => {
    if (stopped) return;
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load, stopped]);

  const serverNow = now + skewMs;
  const until = data?.accessUntil ? new Date(data.accessUntil).getTime() : null;

  useEffect(() => {
    if (until !== null && serverNow >= until) endSession();
  }, [until, serverNow, endSession]);

  if (stopped || !data || until === null) return null;

  const remaining = until - serverNow;
  const minutesLeft = Math.max(0, Math.ceil(remaining / 60_000));
  const endsSoon = remaining <= WARN_MS;
  const scheduledEnd = data.scheduledEnd
    ? new Date(data.scheduledEnd).getTime()
    : null;

  let message: string | null = null;
  if (data.phase === "grace") {
    message = `Your working hours have ended. A grace period of ${data.graceMinutes} minutes has started: access ends at ${clock(data.accessUntil!)}.`;
  } else if (data.phase === "extra") {
    message = `You are working in extra time: access ends at ${clock(data.accessUntil!)}.`;
  } else if (
    data.phase === "normal" &&
    scheduledEnd !== null &&
    scheduledEnd - serverNow <= WARN_MS
  ) {
    message =
      data.graceMinutes > 0
        ? `Your working hours end at ${clock(data.scheduledEnd!)}. A ${data.graceMinutes}-minute grace period follows; access ends at ${clock(data.accessUntil!)}.`
        : `Your working hours end at ${clock(data.scheduledEnd!)}.`;
  } else if (endsSoon) {
    message = `Your access ends at ${clock(data.accessUntil!)}.`;
  }
  if (message && endsSoon)
    message += ` ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"} left.`;

  const canRequest = data.hoursEnabled && !data.pendingRequest;

  const sendRequest = async () => {
    setSending(true);
    setRequestError(null);
    try {
      const res = await fetch("/api/user/access-window/request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes, note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to send your request");
      setDialogOpen(false);
      setNote("");
      await load();
    } catch (err) {
      setRequestError(
        err instanceof Error ? err.message : "Failed to send your request",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Box
      sx={{
        px: { xs: 1, sm: 2 },
        pt: 1,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {grant && (
        <Alert
          severity="success"
          onClose={() => {
            writeSeenGrant(grant.id);
            setGrant(null);
          }}
        >
          {grant.minutes} minutes extra time added. Access now ends at{" "}
          {clock(data.accessUntil!)}.
        </Alert>
      )}
      {message && (
        <Alert
          severity={endsSoon ? "warning" : "info"}
          action={
            canRequest ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => setDialogOpen(true)}
              >
                Request more time
              </Button>
            ) : undefined
          }
        >
          {message}
          {data.pendingRequest &&
            ` Your request for ${data.pendingRequest.minutesRequested} more minutes is waiting for a super admin.`}
        </Alert>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Request more time</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            {requestError && <Alert severity="error">{requestError}</Alert>}
            <TextField
              id="access-request-minutes"
              select
              label="Extra time"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <MenuItem key={m} value={m}>
                  {m} minutes
                </MenuItem>
              ))}
            </TextField>
            <TextField
              id="access-request-note"
              label="What do you need to finish? (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              multiline
              minRows={2}
              inputProps={{ maxLength: 500 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={sending}>
            Cancel
          </Button>
          <Button variant="contained" onClick={sendRequest} disabled={sending}>
            Send request
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
