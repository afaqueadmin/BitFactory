"use client";

import { useState, useEffect, useRef } from "react";
import { Box, Button, TextField, Typography, Alert } from "@mui/material";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

const PASSKEY_OFFER_FLAG = "bf_offer_passkey_setup";

interface TwoFactorVerificationProps {
  email: string;
  onVerified: (redirectUrl: string) => void;
}

export default function TwoFactorVerification({
  email,
  onVerified,
}: TwoFactorVerificationProps) {
  const { d, fonts } = useDaylight();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const textFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus on TextField when component mounts
    textFieldRef.current?.focus();
  }, []);

  const handleVerify = async () => {
    try {
      const response = await fetch("/api/auth/2fa/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, token }),
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        setError(data.error || "Invalid 2FA token");
        return;
      }

      // Only set the passkey offer flag after the server has set auth cookies
      if (typeof window !== "undefined") {
        sessionStorage.setItem(PASSKEY_OFFER_FLAG, "1");
      }

      onVerified(data.redirectUrl);
    } catch {
      setError("Failed to verify 2FA token");
    }
  };

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 400,
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
        Two-Factor Authentication Required
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

      <Typography sx={{ fontSize: 13, color: d.muted, mb: "16px" }}>
        Enter the verification code from your authenticator app or use a backup
        code:
      </Typography>

      <Box sx={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
        <TextField
          inputRef={textFieldRef}
          label="Verification Code"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && token) {
              handleVerify();
            }
          }}
          fullWidth
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: "8px",
              fontFamily: fonts.body,
              "& fieldset": { borderColor: d.inputBorder },
              "&:hover fieldset": { borderColor: d.action },
            },
            "& .MuiOutlinedInput-root.Mui-focused fieldset": {
              borderColor: d.action,
              borderWidth: "2px",
            },
            "& .MuiInputLabel-root": { fontFamily: fonts.body },
          }}
        />
        <Button
          onClick={handleVerify}
          disabled={!token}
          sx={{
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
          }}
        >
          Verify
        </Button>
      </Box>
    </Box>
  );
}
