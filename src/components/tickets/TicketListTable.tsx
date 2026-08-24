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
}: TicketListTableProps) {
  const router = useRouter();

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (tickets.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">No tickets found.</Typography>
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Subject</TableCell>
            <TableCell>Category</TableCell>
            {showRaisedBy && <TableCell>Raised By</TableCell>}
            {showFranchise && <TableCell>Franchise</TableCell>}
            {showAssignee && <TableCell>Assigned To</TableCell>}
            {showPriority && <TableCell>Priority</TableCell>}
            <TableCell>Status</TableCell>
            <TableCell>Messages</TableCell>
            <TableCell>Last Updated</TableCell>
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
