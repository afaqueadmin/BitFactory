"use client";

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
} from "@mui/material";
import { useWalletChangeRequests } from "@/lib/hooks/useWalletChangeRequests";

const STATUS_COLOR: Record<string, "warning" | "success" | "error"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "error",
};

export default function WalletChangeRequestHistory() {
  const { requests, loading, error } = useWalletChangeRequests();

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
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
      <Typography variant="body2" color="text.secondary">
        No wallet change requests yet.
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Requested</TableCell>
            <TableCell>Previous Address</TableCell>
            <TableCell>New Address</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Reviewed</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {requests.map((req) => (
            <TableRow key={req.id}>
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
                />
                {req.status === "REJECTED" && req.rejectionReason && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
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
