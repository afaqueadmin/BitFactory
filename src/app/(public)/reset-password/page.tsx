"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { RADIUS_CARD, logoFilter, useDaylight } from "@/lib/daylight";

type LinkState =
  | { status: "checking" }
  | { status: "invalid" }
  | { status: "ready"; email: string; requiresTwoFactor: boolean }
  | { status: "done" };

/**
 * C-1: where the emailed forgotten-password link lands. The token is in the
 * URL fragment (never sent to the server with the page request); it's read
 * once, then removed from the address bar.
 */
export default function ResetPassword() {
  const { d, darkMode, fonts } = useDaylight();
  const [token, setToken] = useState<string | null>(null);
  const [link, setLink] = useState<LinkState>({ status: "checking" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const fromHash = params.get("token");
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (!fromHash) {
      setLink({ status: "invalid" });
      return;
    }
    setToken(fromHash);
    fetch("/api/user/reset-password/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: fromHash }),
    })
      .then((res) => res.json())
      .then((data) =>
        setLink(
          data.valid
            ? {
                status: "ready",
                email: data.email,
                requiresTwoFactor: !!data.requiresTwoFactor,
              }
            : { status: "invalid" },
        ),
      )
      .catch(() => setLink({ status: "invalid" }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Your new password must be at least 8 characters long.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/user/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password, twoFactorCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setLink({ status: "done" });
      } else if (data.code === "INVALID_LINK") {
        setLink({ status: "invalid" });
      } else {
        setError(data.error || "Couldn't reset your password.");
      }
    } catch {
      setError("Couldn't reset your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputSx = {
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
  };

  const primaryButtonSx = {
    mt: 2,
    minHeight: 42,
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

  const message = (text: string) => (
    <Typography
      sx={{ fontSize: 14, color: d.text, fontFamily: fonts.body, mb: 1 }}
    >
      {text}
    </Typography>
  );

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        bgcolor: d.canvas,
        fontFamily: fonts.body,
      }}
    >
      <Box
        sx={{
          p: 4,
          width: "100%",
          maxWidth: 400,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          bgcolor: d.surface,
          border: `1px solid ${d.border}`,
          borderRadius: RADIUS_CARD,
          boxShadow: d.shadow,
        }}
      >
        <Box mb={1} sx={{ display: "flex", justifyContent: "center" }}>
          <Image
            src="/BitfactoryLogo.webp"
            alt="BitFactory Logo"
            width={220}
            height={110}
            style={{ height: "auto", filter: logoFilter(darkMode) }}
          />
        </Box>
        <Typography
          component="h1"
          mb={2}
          sx={{
            fontSize: 20,
            fontWeight: 700,
            color: d.text,
            fontFamily: fonts.heading,
          }}
        >
          Reset your password
        </Typography>

        {link.status === "checking" && (
          <CircularProgress sx={{ color: d.action, my: 2 }} />
        )}

        {link.status === "invalid" && (
          <Box sx={{ width: "100%" }}>
            {message(
              "This reset link is invalid, has expired or was already used. Reset links work once and expire after 30 minutes.",
            )}
            {message(
              'Go back to the login page and choose "Forgot password?" to get a new one.',
            )}
            <Button href="/login" fullWidth sx={primaryButtonSx}>
              Back to login
            </Button>
          </Box>
        )}

        {link.status === "done" && (
          <Box sx={{ width: "100%" }}>
            {message(
              "Your password has been changed and you've been signed out on every device. You can now log in with your new password.",
            )}
            <Button href="/login" fullWidth sx={primaryButtonSx}>
              Go to login
            </Button>
          </Box>
        )}

        {link.status === "ready" && (
          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{ width: "100%" }}
          >
            <Typography
              sx={{ fontSize: 14, color: d.muted, fontFamily: fonts.body }}
            >
              Choose a new password for {link.email}.
            </Typography>

            {error && (
              <Alert
                severity="error"
                sx={{
                  mt: 2,
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

            <TextField
              fullWidth
              required
              label="New password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              helperText="At least 8 characters"
              sx={inputSx}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      sx={{ color: d.muted }}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              fullWidth
              required
              label="Confirm new password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              margin="normal"
              sx={inputSx}
            />

            {link.requiresTwoFactor && (
              <TextField
                fullWidth
                required
                label="Authenticator code or backup code"
                autoComplete="one-time-code"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                margin="normal"
                helperText="Your account has two-factor authentication, so a code is needed too."
                sx={inputSx}
              />
            )}

            <Button
              type="submit"
              fullWidth
              disabled={
                submitting ||
                !password ||
                !confirm ||
                (link.requiresTwoFactor && !twoFactorCode.trim())
              }
              startIcon={
                submitting ? (
                  <CircularProgress size={20} sx={{ color: "#fff" }} />
                ) : null
              }
              sx={primaryButtonSx}
            >
              {submitting ? "Saving..." : "Set new password"}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
