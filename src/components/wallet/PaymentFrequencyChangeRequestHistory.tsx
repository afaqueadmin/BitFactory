"use client";

/**
 * Client-facing list of payment frequency change requests - mirrors
 * WalletChangeRequestHistory (mobile card list / desktop table, optional
 * Daylight styling), minus the copy-address and payout-freeze bits that
 * don't apply to a schedule change.
 */

import React from "react";
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
  useTheme,
  useMediaQuery,
  alpha,
} from "@mui/material";
import { usePaymentFrequencyChangeRequests } from "@/lib/hooks/usePaymentFrequencyChangeRequests";
import { formatPaymentSchedule } from "@/lib/constants/paymentFrequency";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

const STATUS_COLOR: Record<string, "warning" | "info" | "success" | "error"> = {
  PENDING: "warning",
  CONFIRMED: "info",
  APPROVED: "success",
  REJECTED: "error",
};

/** Daylight soft-tone pill colours for a request's status. */
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

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

// currentFrequency is null when Luxor couldn't be reached at submission.
const previousSchedule = (frequency: string | null, day: string | null) =>
  frequency ? formatPaymentSchedule(frequency, day) : "Unknown";

export default function PaymentFrequencyChangeRequestHistory({
  daylight = false,
}: {
  /** Daylight styling: white card chrome, soft-tone status pills. */
  daylight?: boolean;
} = {}) {
  const theme = useTheme();
  const { d, fonts } = useDaylight();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isDark = theme.palette.mode === "dark";
  const { requests, loading, error } = usePaymentFrequencyChangeRequests();

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
          No payment frequency change requests yet.
        </Typography>
      </Paper>
    );
  }

  const statusChip = (status: string, sx: object) => (
    <Chip
      label={status}
      size="small"
      color={daylight ? undefined : STATUS_COLOR[status] || "default"}
      sx={{
        ...sx,
        ...(daylight && {
          fontFamily: fonts.body,
          backgroundColor: daylightStatusTone(d, status).bg,
          color: daylightStatusTone(d, status).text,
        }),
      }}
    />
  );

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
                {formatDate(req.createdAt)}
              </Typography>
              {statusChip(req.status, {
                fontWeight: 700,
                fontSize: "0.7rem",
                height: 22,
              })}
            </Box>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", fontSize: "0.7rem", mb: 1 }}
            >
              Subaccount: <strong>{req.subaccountName}</strong>
            </Typography>

            <Box sx={{ mb: 1 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", fontSize: "0.7rem" }}
              >
                Requested Schedule
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {formatPaymentSchedule(
                  req.requestedFrequency,
                  req.requestedDayOfWeek,
                )}
              </Typography>
            </Box>

            <Box sx={{ mb: 1 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", fontSize: "0.7rem" }}
              >
                Previous Schedule
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {previousSchedule(req.currentFrequency, req.currentDayOfWeek)}
              </Typography>
            </Box>

            {req.reviewedAt && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", fontSize: "0.7rem", mt: 0.5 }}
              >
                Reviewed on: {formatDate(req.reviewedAt)}
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
              "Previous Schedule",
              "New Schedule",
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
              <TableCell>{formatDate(req.createdAt)}</TableCell>
              <TableCell sx={{ fontSize: "0.8rem" }}>
                {req.subaccountName}
              </TableCell>
              <TableCell sx={{ fontSize: "0.8rem" }}>
                {previousSchedule(req.currentFrequency, req.currentDayOfWeek)}
              </TableCell>
              <TableCell sx={{ fontSize: "0.8rem", fontWeight: 600 }}>
                {formatPaymentSchedule(
                  req.requestedFrequency,
                  req.requestedDayOfWeek,
                )}
              </TableCell>
              <TableCell>
                {statusChip(req.status, { fontWeight: 600 })}
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
              </TableCell>
              <TableCell>
                {req.reviewedAt ? formatDate(req.reviewedAt) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
