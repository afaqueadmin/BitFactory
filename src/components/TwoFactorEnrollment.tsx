"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography,
} from "@mui/material";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

interface TwoFactorEnrollmentProps {
  /** Called once 2FA is on and the session cookies are set. */
  onComplete: (redirectUrl: string) => void;
}

/**
 * Forced 2FA setup shown on the login page when /api/login answers
 * requiresTwoFactorSetup (M-1): scan QR -> confirm a code -> save backup
 * codes -> continue into the app.
 */
export default function TwoFactorEnrollment({
  onComplete,
}: TwoFactorEnrollmentProps) {
  const { d, fonts } = useDaylight();
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [redirectUrl, setRedirectUrl] = useState("");
  const started = useRef(false);

  useEffect(() => {
    // Guard against React strict-mode double effects creating two secrets.
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/2fa/enroll/setup", {
          method: "POST",
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Couldn't start two-factor setup");
          return;
        }
        setQrCode(data.qrCode);
        setSecret(data.secret);
      } catch {
        setError("Couldn't start two-factor setup");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleVerify = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/2fa/enroll/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code");
        return;
      }
      setBackupCodes(data.backupCodes);
      setRedirectUrl(data.redirectUrl);
    } catch {
      setError("Couldn't verify the code");
    } finally {
      setSubmitting(false);
    }
  };

  const buttonSx = {
    minHeight: 44,
    px: "18px",
    flexShrink: 0,
    borderRadius: "8px",
    textTransform: "none",
    fontWeight: 650,
    fontFamily: fonts.body,
    color: "#fff",
    bgcolor: d.action,
    boxShadow: "none",
    "&:hover": { bgcolor: d.actionHover, boxShadow: "none" },
    "&.Mui-disabled": { bgcolor: d.border, color: d.muted },
  } as const;

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 440,
        p: 4,
        bgcolor: d.surface,
        border: `1px solid ${d.border}`,
        borderRadius: RADIUS_CARD,
        boxShadow: d.shadow,
        fontFamily: fonts.body,
      }}
    >
      <Typography
        sx={{
          fontFamily: fonts.heading,
          fontWeight: 750,
          fontSize: 18,
          color: d.text,
          mb: "10px",
        }}
      >
        {backupCodes
          ? "Save your backup codes"
          : "Set up two-factor authentication"}
      </Typography>

      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 2,
            borderRadius: "8px",
            bgcolor: d.dangerSoft,
            color: d.danger,
            fontFamily: fonts.body,
            "& .MuiAlert-icon": { color: d.danger },
          }}
        >
          {error}
        </Alert>
      )}

      {backupCodes ? (
        <>
          <Typography sx={{ fontSize: 13, color: d.muted, mb: "12px" }}>
            Two-factor authentication is on. Keep these codes somewhere safe -
            each one lets you sign in once if you lose your phone. They
            won&apos;t be shown again.
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "6px 16px",
              p: 2,
              mb: 2,
              borderRadius: "8px",
              bgcolor: d.canvas,
              border: `1px solid ${d.border}`,
              fontFamily: "monospace",
              fontSize: 15,
              color: d.text,
            }}
          >
            {backupCodes.map((code) => (
              <span key={code}>{code}</span>
            ))}
          </Box>
          <Button
            fullWidth
            onClick={() => onComplete(redirectUrl)}
            sx={buttonSx}
          >
            I&apos;ve saved them - continue
          </Button>
        </>
      ) : loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} sx={{ color: d.action }} />
        </Box>
      ) : qrCode ? (
        <>
          <Typography sx={{ fontSize: 13, color: d.muted, mb: "12px" }}>
            Two-factor authentication is now required for your account. Scan
            this QR code with an authenticator app (Google Authenticator,
            Microsoft Authenticator, Authy...), then enter the 6-digit code it
            shows.
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
            <Image
              src={qrCode}
              alt="Two-factor authentication QR code"
              width={180}
              height={180}
              unoptimized
            />
          </Box>
          <Typography
            sx={{
              fontSize: 12,
              color: d.muted,
              textAlign: "center",
              mb: 2,
              wordBreak: "break-all",
            }}
          >
            Can&apos;t scan? Enter this key instead:{" "}
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              {secret}
            </Box>
          </Typography>
          <Box sx={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <TextField
              label="6-digit code"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && token && !submitting) handleVerify();
              }}
              inputProps={{ inputMode: "numeric", maxLength: 6 }}
              fullWidth
              autoFocus
            />
            <Button
              onClick={handleVerify}
              disabled={!token || submitting}
              sx={buttonSx}
            >
              {submitting ? "Checking..." : "Verify"}
            </Button>
          </Box>
        </>
      ) : (
        <Button
          fullWidth
          onClick={() => window.location.reload()}
          sx={buttonSx}
        >
          Back to login
        </Button>
      )}
    </Box>
  );
}
