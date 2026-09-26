"use client";

import React, { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
  alpha,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import { useWalletChangeRequests } from "@/lib/hooks/useWalletChangeRequests";
import FreezeCountdown from "@/components/wallet/FreezeCountdown";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

const STATUS_COLOR: Record<string, "warning" | "info" | "success" | "error"> = {
  PENDING: "warning",
  CONFIRMED: "info",
  APPROVED: "success",
  REJECTED: "error",
};

/** Daylight soft-tone pill colours for a wallet change request's status. */
function daylightStatusTone(
  d: ReturnType<typeof useDaylight>["d"],
  status: string,
) {
  switch (status) {
    case "APPROVED":
      return { bg: d.mint, text: d.success };
    case "REJECTED":
      return { bg: d.dangerSoft, text: d.danger };
    case "CONFIRMED":
      return { bg: d.skySoft, text: d.action };
    default:
      return { bg: d.amber, text: d.warning };
  }
}

export default function WalletChangeRequestHistory({
  daylight = false,
}: {
  /** Daylight styling: white card chrome, soft-tone status pills. */
  daylight?: boolean;
} = {}) {
  const theme = useTheme();
  const { d, fonts } = useDaylight();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isDark = theme.palette.mode === "dark";
  const { requests, loading, error } = useWalletChangeRequests();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress
          size={24}
          sx={daylight ? { color: d.action } : undefined}
        />
      </Box>
    );
  }

  if (error) {
    return (
      <Typography variant="body2" color="error">
        {error}
      </Typography>
    );
  }

  if (requests.length === 0) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 3,
          textAlign: "center",
          borderRadius: daylight ? RADIUS_CARD : 2,
          backgroundColor: daylight
            ? d.canvas
            : isDark
              ? "rgba(255, 255, 255, 0.02)"
              : "rgba(0, 0, 0, 0.01)",
          borderColor: daylight ? d.border : undefined,
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
          sx={daylight ? { fontFamily: fonts.body, color: d.muted } : undefined}
        >
          No wallet change requests yet.
        </Typography>
      </Paper>
    );
  }

  // Mobile View: Clean Card List
  if (isMobile) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {requests.map((req) => (
          <Paper
            key={req.id}
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: daylight ? RADIUS_CARD : 2.5,
              backgroundColor: daylight
                ? d.surface
                : isDark
                  ? "rgba(255, 255, 255, 0.03)"
                  : "rgba(0, 0, 0, 0.015)",
              border: `1px solid ${
                daylight
                  ? d.border
                  : isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.08)"
              }`,
              boxShadow: daylight ? d.shadow : undefined,
              fontFamily: daylight ? fonts.body : undefined,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 1.25,
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 600 }}
              >
                {new Date(req.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </Typography>
              <Chip
                label={req.status}
                size="small"
                color={
                  daylight ? undefined : STATUS_COLOR[req.status] || "default"
                }
                sx={{
                  fontWeight: 700,
                  fontSize: "0.7rem",
                  height: 22,
                  ...(daylight && {
                    fontFamily: fonts.body,
                    backgroundColor: daylightStatusTone(d, req.status).bg,
                    color: daylightStatusTone(d, req.status).text,
                  }),
                }}
              />
            </Box>

            {req.subaccountName && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", fontSize: "0.7rem", mb: 1 }}
              >
                Subaccount: <strong>{req.subaccountName}</strong>
              </Typography>
            )}

            <Box sx={{ mb: 1 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", fontSize: "0.7rem" }}
              >
                Requested Address
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: daylight
                    ? d.canvas
                    : isDark
                      ? "rgba(0,0,0,0.3)"
                      : "rgba(0,0,0,0.04)",
                  p: 0.75,
                  borderRadius: daylight ? "8px" : 1.5,
                  mt: 0.25,
                  ...(daylight && { border: `1px solid ${d.border}` }),
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                    wordBreak: "break-all",
                    fontWeight: 600,
                  }}
                >
                  {req.requestedAddress}
                </Typography>
                <Tooltip
                  title={copiedId === req.id ? "Copied!" : "Copy"}
                  placement="top"
                >
                  <IconButton
                    size="small"
                    onClick={() => handleCopy(req.id, req.requestedAddress)}
                    sx={{ ml: 1, p: 0.5, flexShrink: 0 }}
                  >
                    {copiedId === req.id ? (
                      <CheckIcon sx={{ fontSize: 14, color: "success.main" }} />
                    ) : (
                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                    )}
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {req.currentAddress && (
              <Box sx={{ mb: 1 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", fontSize: "0.7rem" }}
                >
                  Previous Address
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: "monospace",
                    fontSize: "0.72rem",
                    wordBreak: "break-all",
                    opacity: 0.8,
                  }}
                >
                  {req.currentAddress}
                </Typography>
              </Box>
            )}

            {req.reviewedAt && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", fontSize: "0.7rem", mt: 0.5 }}
              >
                Reviewed on:{" "}
                {new Date(req.reviewedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </Typography>
            )}

            {req.status === "REJECTED" && req.rejectionReason && (
              <Box
                sx={{
                  mt: 1,
                  p: 1,
                  borderRadius: 1.5,
                  backgroundColor: daylight
                    ? d.dangerSoft
                    : alpha(theme.palette.error.main, 0.1),
                  border: `1px solid ${daylight ? d.borderDanger : alpha(theme.palette.error.main, 0.2)}`,
                }}
              >
                <Typography
                  variant="caption"
                  color={daylight ? undefined : "error.main"}
                  sx={{
                    fontWeight: 600,
                    display: "block",
                    ...(daylight && {
                      fontFamily: fonts.body,
                      color: d.danger,
                    }),
                  }}
                >
                  Reason: {req.rejectionReason}
                </Typography>
              </Box>
            )}

            {req.status === "APPROVED" && (
              <FreezeCountdown reviewedAt={req.reviewedAt} />
            )}
          </Paper>
        ))}
      </Box>
    );
  }

  // Desktop Table View
  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{
        borderRadius: daylight ? RADIUS_CARD : 2.5,
        overflow: "hidden",
        ...(daylight && {
          backgroundColor: d.surface,
          borderColor: d.border,
          boxShadow: d.shadow,
          fontFamily: fonts.body,
        }),
      }}
    >
      <Table size="small">
        <TableHead>
          <TableRow
            sx={{
              backgroundColor: daylight
                ? d.tableHead
                : theme.palette.action.hover,
            }}
          >
            {[
              "Requested",
              "Subaccount",
              "Previous Address",
              "New Address",
              "Status",
              "Reviewed",
            ].map((label) => (
              <TableCell
                key={label}
                sx={{
                  fontWeight: 700,
                  ...(daylight && {
                    fontFamily: fonts.body,
                    color: d.muted,
                    fontSize: 10,
                    letterSpacing: ".015em",
                    textTransform: "uppercase",
                    borderBottomColor: d.border,
                  }),
                }}
              >
                {label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {requests.map((req) => (
            <TableRow
              key={req.id}
              hover
              sx={
                daylight
                  ? {
                      fontFamily: fonts.body,
                      "&:hover": { backgroundColor: d.hover },
                      "& .MuiTableCell-root": {
                        borderBottomColor: d.border,
                        color: d.text,
                      },
                    }
                  : undefined
              }
            >
              <TableCell>
                {new Date(req.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </TableCell>
              <TableCell sx={{ fontSize: "0.8rem" }}>
                {req.subaccountName || "—"}
              </TableCell>
              <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                {req.currentAddress || "Not configured"}
              </TableCell>
              <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                {req.requestedAddress}
              </TableCell>
              <TableCell>
                <Chip
                  label={req.status}
                  size="small"
                  color={
                    daylight ? undefined : STATUS_COLOR[req.status] || "default"
                  }
                  sx={{
                    fontWeight: 600,
                    ...(daylight && {
                      fontFamily: fonts.body,
                      backgroundColor: daylightStatusTone(d, req.status).bg,
                      color: daylightStatusTone(d, req.status).text,
                    }),
                  }}
                />
                {req.status === "REJECTED" && req.rejectionReason && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    sx={{ mt: 0.25 }}
                  >
                    {req.rejectionReason}
                  </Typography>
                )}
                {req.status === "APPROVED" && (
                  <Box sx={{ mt: 0.5 }}>
                    <FreezeCountdown reviewedAt={req.reviewedAt} dense />
                  </Box>
                )}
              </TableCell>
              <TableCell>
                {req.reviewedAt
                  ? new Date(req.reviewedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
