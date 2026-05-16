"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
} from "@mui/material";
import { registerPasskey } from "@/lib/webauthn/registration";
import { isWebAuthnSupported } from "@/lib/webauthn/utils";

const PASSKEY_OFFER_FLAG = "bf_offer_passkey_setup";

export default function PasskeySetupPrompt() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (typeof window === "undefined") return;

      const shouldOffer = sessionStorage.getItem(PASSKEY_OFFER_FLAG) === "1";
      if (!shouldOffer) return;

      if (!isWebAuthnSupported()) {
        sessionStorage.removeItem(PASSKEY_OFFER_FLAG);
        return;
      }

      try {
        // Confirm authenticated session via cookie-backed auth check.
        const authRes = await fetch("/api/auth/check", {
          method: "GET",
          credentials: "include",
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        if (!authRes.ok) {
          return;
        }

        const credsRes = await fetch("/api/auth/webauthn/credentials", {
          method: "GET",
          credentials: "include",
        });

        if (!credsRes.ok) {
          sessionStorage.removeItem(PASSKEY_OFFER_FLAG);
          return;
        }

        const credsData = await credsRes.json();
        const credentials = credsData.credentials || [];

        if (Array.isArray(credentials) && credentials.length === 0) {
          setOpen(true);
        } else {
          sessionStorage.removeItem(PASSKEY_OFFER_FLAG);
        }
      } catch (error) {
        console.warn(
          "[PasskeySetupPrompt] Failed to evaluate passkey offer",
          error,
        );
      }
    };

    void run();
  }, []);

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(PASSKEY_OFFER_FLAG);
    }
    setOpen(false);
  };

  const handleSetup = async () => {
    setLoading(true);
    try {
      const result = await registerPasskey();
      if (!result.success) {
        console.error(
          "[PasskeySetupPrompt] Passkey registration failed:",
          result.error,
        );
      }
    } finally {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(PASSKEY_OFFER_FLAG);
      }
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleDismiss} maxWidth="xs" fullWidth>
      <DialogTitle>Set up a passkey?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          For faster and safer logins, would you like to set up a passkey (Face
          ID / Touch ID / Windows Hello) on this device?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleDismiss}>Not now</Button>
        <Button onClick={handleSetup} variant="contained" disabled={loading}>
          {loading ? "Setting up..." : "Set up passkey"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
