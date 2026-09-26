"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  CircularProgress,
  Alert,
} from "@mui/material";
import { TicketListItem } from "@/lib/hooks/useTickets";
import { TicketStatusBadge, TicketPriorityBadge } from "./TicketBadges";
import { TicketCategoryLabel } from "./TicketBadges";
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

interface TicketListTableProps {
  tickets: TicketListItem[];
  loading: boolean;
  error: string | null;
  detailBasePath: string;
  showRaisedBy?: boolean;
  showFranchise?: boolean;
  showAssignee?: boolean;
  // Priority is a support/triage concept - never shown to a CLIENT viewer.
  showPriority?: boolean;
  daylight?: boolean;
}

export default function TicketListTable({
  tickets,
  loading,
  error,
  detailBasePath,
  showRaisedBy = false,
  showFranchise = false,
  showAssignee = false,
  showPriority = true,
  daylight = false,
}: TicketListTableProps) {
  const router = useRouter();
  const { d, fonts } = useDaylight();

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={daylight ? { color: d.action } : undefined} />
      </Box>
    );
  }

  if (error) {
    if (daylight) {
      return (
        <Box
          sx={{
            borderRadius: "8px",
            bgcolor: d.dangerSoft,
            color: d.danger,
            fontFamily: fonts.body,
            fontSize: 13,
            p: 2,
          }}
        >
          {error}
        </Box>
      );
    }
    return <Alert severity="error">{error}</Alert>;
  }

  if (tickets.length === 0) {
    if (daylight) {
      return (
        <Box
          sx={{
            bgcolor: d.surface,
            border: `1px solid ${d.border}`,
            borderRadius: RADIUS_CARD,
            boxShadow: d.shadow,
            p: 4,
            textAlign: "center",
          }}
        >
          <Typography
            sx={{ fontFamily: fonts.body, color: d.muted, fontSize: 13 }}
          >
            No tickets found.
          </Typography>
        </Box>
      );
    }
    return (
      <Paper sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">No tickets found.</Typography>
      </Paper>
    );
  }

  const columns = [
    { key: "subject", label: "Subject", show: true },
    { key: "category", label: "Category", show: true },
    { key: "raisedBy", label: "Raised By", show: showRaisedBy },
    { key: "franchise", label: "Franchise", show: showFranchise },
    { key: "assignee", label: "Assigned To", show: showAssignee },
    { key: "priority", label: "Priority", show: showPriority },
    { key: "status", label: "Status", show: true },
    { key: "messages", label: "Messages", show: true },
    { key: "updated", label: "Last Updated", show: true },
  ];

  if (!daylight) {
    return (
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              {columns
                .filter((c) => c.show)
                .map((c) => (
                  <TableCell key={c.key}>{c.label}</TableCell>
                ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow
                key={ticket.id}
                hover
                onClick={() => router.push(`${detailBasePath}/${ticket.id}`)}
                sx={{ cursor: "pointer" }}
              >
                <TableCell>
                  {ticket.subject}
                  {ticket.miner && (
                    <Typography
                      variant="caption"
                      display="block"
                      color="text.secondary"
                    >
                      {ticket.miner.name}
                    </Typography>
                  )}
                  {ticket.invoice && (
                    <Typography
                      variant="caption"
                      display="block"
                      color="text.secondary"
                    >
                      {ticket.invoice.invoiceNumber}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <TicketCategoryLabel category={ticket.category} />
                </TableCell>
                {showRaisedBy && (
                  <TableCell>
                    {ticket.raisedBy.name || ticket.raisedBy.email}
                    {ticket.onBehalfOf && (
                      <Typography
                        variant="caption"
                        display="block"
                        color="text.secondary"
                      >
                        for {ticket.onBehalfOf.name || ticket.onBehalfOf.email}
                      </Typography>
                    )}
                  </TableCell>
                )}
                {showFranchise && (
                  <TableCell>{ticket.franchise?.businessName || "-"}</TableCell>
                )}
                {showAssignee && (
                  <TableCell>
                    {ticket.assignedTo
                      ? ticket.assignedTo.name || ticket.assignedTo.email
                      : "Unassigned"}
                  </TableCell>
                )}
                {showPriority && (
                  <TableCell>
                    {ticket.priority && (
                      <TicketPriorityBadge priority={ticket.priority} />
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <TicketStatusBadge status={ticket.status} />
                </TableCell>
                <TableCell>{ticket._count.messages}</TableCell>
                <TableCell>
                  {new Date(ticket.updatedAt).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  const headerCellSx = {
    fontFamily: fonts.body,
    fontWeight: 600,
    fontSize: 10,
    letterSpacing: ".015em",
    textTransform: "uppercase" as const,
    color: d.muted,
    borderBottomColor: d.border,
    py: { xs: 1.5, sm: 2 },
    px: { xs: 1.5, sm: 2 },
  };

  const cellSx = {
    py: { xs: 1, sm: 1.5 },
    px: { xs: 1.5, sm: 2 },
    fontFamily: fonts.body,
  };

  return (
    <Box
      sx={{
        bgcolor: d.surface,
        border: `1px solid ${d.border}`,
        borderRadius: RADIUS_CARD,
        boxShadow: d.shadow,
        overflow: "hidden",
      }}
    >
      <TableContainer>
        <Table sx={{ minWidth: { xs: 320, sm: 700 } }} size="small">
          <TableHead sx={{ backgroundColor: d.tableHead }}>
            <TableRow>
              {columns
                .filter((c) => c.show)
                .map((c) => (
                  <TableCell key={c.key} sx={headerCellSx}>
                    {c.label}
                  </TableCell>
                ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow
                key={ticket.id}
                hover
                onClick={() => router.push(`${detailBasePath}/${ticket.id}`)}
                sx={{
                  cursor: "pointer",
                  "&:hover": { backgroundColor: d.hover },
                  "& .MuiTableCell-root": {
                    borderBottomColor: d.border,
                  },
                  "&:last-child td, &:last-child th": { border: 0 },
                }}
              >
                <TableCell sx={cellSx}>
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: d.text,
                      fontFamily: fonts.body,
                    }}
                  >
                    {ticket.subject}
                  </Typography>
                  {ticket.miner && (
                    <Typography
                      sx={{
                        fontSize: 11,
                        color: d.muted,
                        fontFamily: fonts.body,
                      }}
                    >
                      {ticket.miner.name}
                    </Typography>
                  )}
                  {ticket.invoice && (
                    <Typography
                      sx={{
                        fontSize: 11,
                        color: d.muted,
                        fontFamily: fonts.body,
                      }}
                    >
                      {ticket.invoice.invoiceNumber}
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ ...cellSx, fontSize: 12, color: d.text }}>
                  <TicketCategoryLabel category={ticket.category} />
                </TableCell>
                {showRaisedBy && (
                  <TableCell sx={{ ...cellSx, fontSize: 12, color: d.text }}>
                    {ticket.raisedBy.name || ticket.raisedBy.email}
                    {ticket.onBehalfOf && (
                      <Typography
                        sx={{
                          fontSize: 11,
                          color: d.muted,
                          fontFamily: fonts.body,
                        }}
                      >
                        for {ticket.onBehalfOf.name || ticket.onBehalfOf.email}
                      </Typography>
                    )}
                  </TableCell>
                )}
                {showFranchise && (
                  <TableCell sx={{ ...cellSx, fontSize: 12, color: d.text }}>
                    {ticket.franchise?.businessName || "-"}
                  </TableCell>
                )}
                {showAssignee && (
                  <TableCell sx={{ ...cellSx, fontSize: 12, color: d.text }}>
                    {ticket.assignedTo
                      ? ticket.assignedTo.name || ticket.assignedTo.email
                      : "Unassigned"}
                  </TableCell>
                )}
                {showPriority && (
                  <TableCell sx={cellSx}>
                    {ticket.priority && (
                      <TicketPriorityBadge
                        priority={ticket.priority}
                        daylight
                      />
                    )}
                  </TableCell>
                )}
                <TableCell sx={cellSx}>
                  <TicketStatusBadge status={ticket.status} daylight />
                </TableCell>
                <TableCell sx={{ ...cellSx, fontSize: 12, color: d.text }}>
                  {ticket._count.messages}
                </TableCell>
                <TableCell sx={{ ...cellSx, fontSize: 12, color: d.text }}>
                  {new Date(ticket.updatedAt).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
