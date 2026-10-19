"use client";

/**
 * Dashboard card inviting a Potential Customer to request a simulated
 * account: their account then shows how a real BitFactory miner performs
 * and earns, with a simulated balance. Admins review the request on the
 * Simulated Accounts page. Renders nothing for anyone who can't request one.
 */

import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Typography,
} from "@mui/material";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

type RequestStatus = "none" | "pending" | "declined";

export default function SimulationRequestCard() {
  const { d, fonts } = useDaylight();
  const [eligible, setEligible] = useState(false);
  const [status, setStatus] = useState<RequestStatus>("none");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/simulated-accounts/request", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setEligible(!!data.eligible);
        setStatus(data.status ?? "none");
      })
      .catch(() => {});
  }, []);

  if (!eligible) return null;

  const handleRequest = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/simulated-accounts/request", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send request");
      setStatus("pending");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setSending(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: { xs: "flex-start", sm: "center" },
        flexDirection: { xs: "column", sm: "row" },
        gap: 2,
        p: { xs: "18px", sm: "20px 24px" },
        mb: { xs: "18px", sm: "22px" },
        borderRadius: RADIUS_CARD,
        bgcolor: d.surface,
        border: `1px solid ${d.border}`,
        boxShadow: d.shadow,
        fontFamily: fonts.body,
      }}
    >
      <Box
        aria-hidden
        sx={{
          display: "grid",
          placeItems: "center",
          width: 40,
          height: 40,
          borderRadius: "10px",
          bgcolor: d.skySoft,
          color: d.action,
          flexShrink: 0,
        }}
      >
        <ScienceOutlinedIcon />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontFamily: fonts.heading,
            fontWeight: 700,
            fontSize: 16,
            color: d.text,
          }}
        >
          See how a real miner earns
        </Typography>
        <Typography sx={{ fontSize: 13, color: d.muted, mt: "4px" }}>
          {status === "pending"
            ? "Your request for a simulated account has been sent. We'll email you as soon as it's ready."
            : "Request a simulated account: your dashboard will show a real BitFactory miner's performance and earnings from today, with a simulated balance. No payment needed."}
        </Typography>
        {status === "declined" && (
          <Typography sx={{ fontSize: 12, color: d.muted, mt: "4px" }}>
            Your previous request wasn&apos;t approved. You can ask again or
            contact support.
          </Typography>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        )}
      </Box>
      {status === "pending" ? (
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: d.success,
            flexShrink: 0,
          }}
        >
          Request sent
        </Typography>
      ) : (
        <Button
          onClick={handleRequest}
          disabled={sending}
          sx={{
            flexShrink: 0,
            minHeight: 40,
            px: 2.5,
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
          {sending ? (
            <CircularProgress size={18} sx={{ color: "#fff" }} />
          ) : (
            "Request Simulated Account"
          )}
        </Button>
      )}
    </Box>
  );
}
