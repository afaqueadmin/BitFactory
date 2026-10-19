"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography,
} from "@mui/material";
import { RADIUS_CARD, logoFilter, useDaylight } from "@/lib/daylight";

/**
 * Public demo-account signup. The account mirrors one real BitFactory miner
 * from the day it's created, with a simulated balance; sign-in details are
 * emailed, which is also how the email address is verified.
 */
export default function TryDemo() {
  const { d, darkMode, fonts } = useDaylight();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || !phoneNumber.trim()) {
      setError("Please fill in your name, email and phone number.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/simulated-accounts/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phoneNumber }),
      });
      const data = await res.json();
      if (res.ok) {
        setDone(data.message);
      } else {
        setError(data.error || "Couldn't create your demo account.");
      }
    } catch {
      setError("Couldn't create your demo account. Please try again.");
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
          maxWidth: 420,
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
          mb={1}
          sx={{
            fontSize: 20,
            fontWeight: 700,
            color: d.text,
            fontFamily: fonts.heading,
          }}
        >
          Try a demo account
        </Typography>

        {done ? (
          <Box sx={{ width: "100%" }}>
            <Typography sx={{ fontSize: 14, color: d.text, mb: 1 }}>
              {done}
            </Typography>
            <Typography sx={{ fontSize: 14, color: d.muted, mb: 1 }}>
              Use the temporary password in the email to log in.
            </Typography>
            <Button href="/login" fullWidth sx={primaryButtonSx}>
              Go to login
            </Button>
          </Box>
        ) : (
          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{ width: "100%" }}
          >
            <Typography sx={{ fontSize: 14, color: d.muted }}>
              See how a real BitFactory miner performs and earns, from today,
              with a simulated starting balance. No payment needed.
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
              label="Full name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              margin="normal"
              inputProps={{ maxLength: 100 }}
              sx={inputSx}
            />
            <TextField
              fullWidth
              required
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              helperText="Your sign-in details are sent here"
              sx={inputSx}
            />
            <TextField
              fullWidth
              required
              label="Phone number"
              type="tel"
              autoComplete="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              margin="normal"
              placeholder="+971 50 123 4567"
              sx={inputSx}
            />

            <Button
              type="submit"
              fullWidth
              disabled={submitting}
              sx={primaryButtonSx}
            >
              {submitting ? (
                <CircularProgress size={20} sx={{ color: "#fff" }} />
              ) : (
                "Create demo account"
              )}
            </Button>

            <Typography
              sx={{ fontSize: 13, color: d.muted, mt: 2, textAlign: "center" }}
            >
              Already have an account?{" "}
              <Link href="/login" style={{ color: d.action }}>
                Log in
              </Link>
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
