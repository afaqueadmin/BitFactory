"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";

/** What the server's verifyStepUp accepts (see src/lib/auth/stepUp.ts). */
export interface StepUpCredentials {
  currentPassword?: string;
  twoFactorToken?: string;
}

export type StepUpCode = "PASSWORD_REQUIRED" | "TWO_FACTOR_REQUIRED";

export function isStepUpCode(code: unknown): code is StepUpCode {
  return code === "PASSWORD_REQUIRED" || code === "TWO_FACTOR_REQUIRED";
}

interface PendingPrompt {
  code: StepUpCode;
  resolve: (creds: StepUpCredentials | null) => void;
}

/**
 * Re-verification for sensitive actions (C-2). The server decides when it's
 * needed: a request without credentials comes back 400 with
 * code PASSWORD_REQUIRED / TWO_FACTOR_REQUIRED, and withStepUp asks the user
 * for that one factor and sends the request again.
 *
 *   const { withStepUp, stepUpDialog } = useStepUp();
 *   const res = await withStepUp((creds) =>
 *     fetch(url, { method: "POST", body: JSON.stringify({ ...data, ...creds }) }));
 *   ...render {stepUpDialog} somewhere in the component.
 */
export function useStepUp() {
  const [prompt, setPrompt] = useState<PendingPrompt | null>(null);
  const [value, setValue] = useState("");
  const promptRef = useRef<PendingPrompt | null>(null);

  const requestStepUp = useCallback(
    (code: StepUpCode) =>
      new Promise<StepUpCredentials | null>((resolve) => {
        const next = { code, resolve };
        promptRef.current = next;
        setValue("");
        setPrompt(next);
      }),
    [],
  );

  const finish = (creds: StepUpCredentials | null) => {
    promptRef.current?.resolve(creds);
    promptRef.current = null;
    setPrompt(null);
    setValue("");
  };

  const submit = () => {
    if (!prompt || !value.trim()) return;
    finish(
      prompt.code === "TWO_FACTOR_REQUIRED"
        ? { twoFactorToken: value.trim() }
        : { currentPassword: value },
    );
  };

  /**
   * Runs `send` without credentials; if the server asks for re-verification,
   * prompts and runs it once more with them. Returns the last response (the
   * first one if the user cancels).
   */
  const withStepUp = useCallback(
    async (
      send: (creds: StepUpCredentials) => Promise<Response>,
    ): Promise<Response> => {
      const first = await send({});
      if (first.status !== 400) return first;
      const body = await first
        .clone()
        .json()
        .catch(() => ({}));
      if (!isStepUpCode(body?.code)) return first;
      const creds = await requestStepUp(body.code);
      return creds ? send(creds) : first;
    },
    [requestStepUp],
  );

  const isTwoFactor = prompt?.code === "TWO_FACTOR_REQUIRED";
  const stepUpDialog = (
    <Dialog
      open={!!prompt}
      onClose={() => finish(null)}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Confirm it&apos;s you</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {isTwoFactor
            ? "Enter the code from your authenticator app (or a backup code) to continue."
            : "Enter your current password to continue."}
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          label={isTwoFactor ? "2FA code" : "Current password"}
          type={isTwoFactor ? "text" : "password"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          inputProps={isTwoFactor ? { maxLength: 16 } : undefined}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => finish(null)}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!value.trim()}>
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );

  return { withStepUp, requestStepUp, stepUpDialog };
}
