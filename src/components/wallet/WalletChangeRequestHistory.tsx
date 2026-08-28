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

const STATUS_COLOR: Record<string, "warning" | "success" | "error"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "error",
};

export default function WalletChangeRequestHistory() {
  const theme = useTheme();
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
        <CircularProgress size={24} />
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
          borderRadius: 2,
          backgroundColor: isDark
            ? "rgba(255, 255, 255, 0.02)"
            : "rgba(0, 0, 0, 0.01)",
        }}
      >
        <Typography variant="body2" color="text.secondary">
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
              borderRadius: 2.5,
              backgroundColor: isDark
                ? "rgba(255, 255, 255, 0.03)"
                : "rgba(0, 0, 0, 0.015)",
              border: `1px solid ${
                isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
              }`,
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
                color={STATUS_COLOR[req.status] || "default"}
                sx={{ fontWeight: 700, fontSize: "0.7rem", height: 22 }}
              />
            </Box>

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
                  backgroundColor: isDark
                    ? "rgba(0,0,0,0.3)"
                    : "rgba(0,0,0,0.04)",
                  p: 0.75,
                  borderRadius: 1.5,
                  mt: 0.25,
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
                  backgroundColor: alpha(theme.palette.error.main, 0.1),
                  border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
                }}
              >
                <Typography
                  variant="caption"
                  color="error.main"
                  sx={{ fontWeight: 600, display: "block" }}
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
        borderRadius: 2.5,
        overflow: "hidden",
      }}
    >
      <Table size="small">
        <TableHead>
          <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
            <TableCell sx={{ fontWeight: 700 }}>Requested</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Previous Address</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>New Address</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Reviewed</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {requests.map((req) => (
            <TableRow key={req.id} hover>
              <TableCell>
                {new Date(req.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
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
                  color={STATUS_COLOR[req.status] || "default"}
                  sx={{ fontWeight: 600 }}
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
