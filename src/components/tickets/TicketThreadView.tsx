"use client";

import React, { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Divider,
  TextField,
  Button,
  Chip,
  FormControlLabel,
  Checkbox,
  MenuItem,
  CircularProgress,
  Alert,
  Stack,
} from "@mui/material";
import { useTicket } from "@/lib/hooks/useTickets";
import {
  TicketStatusBadge,
  TicketPriorityBadge,
  TicketCategoryLabel,
} from "./TicketBadges";
import {
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
} from "@/lib/constants/tickets";

interface TicketThreadViewProps {
  ticketId: string;
  currentUserId: string;
  currentUserRole: "ADMIN" | "SUPER_ADMIN" | "CLIENT" | "FRANCHISEE";
  /** Extra content rendered above the thread (e.g. an assignment control, admin-only). */
  headerExtra?: React.ReactNode;
}

export default function TicketThreadView({
  ticketId,
  currentUserId,
  currentUserRole,
  headerExtra,
}: TicketThreadViewProps) {
  const {
    ticket,
    loading,
    error,
    reply,
    replying,
    updateStatus,
    updatingStatus,
    updatePriority,
    updatingPriority,
  } = useTicket(ticketId);
  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const isStaff =
    currentUserRole === "ADMIN" ||
    currentUserRole === "SUPER_ADMIN" ||
    currentUserRole === "FRANCHISEE";

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !ticket) {
    return <Alert severity="error">{error || "Ticket not found"}</Alert>;
  }

  const handleReply = async () => {
    setReplyError(null);
    if (!message.trim()) {
      setReplyError("Message cannot be empty");
      return;
    }
    try {
      await reply({ message: message.trim(), isInternal });
      setMessage("");
      setIsInternal(false);
    } catch (err) {
      setReplyError(
        err instanceof Error ? err.message : "Failed to send reply",
      );
    }
  };

  const canClose = ticket.status !== "CLOSED";
  const canReopenStatuses = isStaff ? TICKET_STATUSES : ["CLOSED"]; // CLIENT can only close their own ticket

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Paper sx={{ p: 3 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          flexWrap="wrap"
          gap={2}
        >
          <Box>
            <Typography variant="h6">{ticket.subject}</Typography>
            <Typography variant="body2" color="text.secondary">
              Raised by {ticket.raisedBy.name || ticket.raisedBy.email}
              {ticket.onBehalfOf
                ? ` for ${ticket.onBehalfOf.name || ticket.onBehalfOf.email}`
                : ""}
              {ticket.franchise ? ` · ${ticket.franchise.businessName}` : ""}
              {ticket.miner ? ` · Miner: ${ticket.miner.name}` : ""}
              {ticket.invoice
                ? ` · Invoice: ${ticket.invoice.invoiceNumber}`
                : ""}
            </Typography>
          </Box>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Chip
              label={<TicketCategoryLabel category={ticket.category} />}
              size="small"
            />
            {isStaff && ticket.priority && (
              <TicketPriorityBadge priority={ticket.priority} />
            )}
            <TicketStatusBadge status={ticket.status} />
          </Stack>
        </Stack>

        {isStaff && (
          <Box
            sx={{
              mt: 2,
              display: "flex",
              gap: 2,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <TextField
              select
              size="small"
              label="Status"
              value={ticket.status}
              onChange={(e) => updateStatus(e.target.value)}
              disabled={updatingStatus}
              sx={{ minWidth: 220 }}
            >
              {canReopenStatuses.map((s) => (
                <MenuItem key={s} value={s}>
                  {TICKET_STATUS_LABELS[s]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Priority"
              value={ticket.priority || "NORMAL"}
              onChange={(e) => updatePriority(e.target.value)}
              disabled={updatingPriority}
              sx={{ minWidth: 160 }}
            >
              {TICKET_PRIORITIES.map((p) => (
                <MenuItem key={p} value={p}>
                  {TICKET_PRIORITY_LABELS[p]}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        )}
        {!isStaff && canClose && (
          <Box sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              size="small"
              disabled={updatingStatus}
              onClick={() => updateStatus("CLOSED")}
            >
              Mark as resolved / close ticket
            </Button>
          </Box>
        )}

        {headerExtra}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>
          Conversation
        </Typography>
        <Stack divider={<Divider />} spacing={2}>
          {ticket.messages.map((msg) => {
            const isMine = msg.authorId === currentUserId;
            return (
              <Box key={msg.id}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography variant="subtitle2">
                    {msg.isSystemGenerated
                      ? "System"
                      : msg.author?.name || msg.author?.email || "Unknown"}
                    {isMine && !msg.isSystemGenerated && " (you)"}
                    {msg.isInternal && (
                      <Chip
                        label="Internal note"
                        size="small"
                        color="secondary"
                        variant="outlined"
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(msg.createdAt).toLocaleString()}
                  </Typography>
                </Stack>
                <Typography
                  variant="body2"
                  sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}
                >
                  {msg.body}
                </Typography>
              </Box>
            );
          })}
        </Stack>

        <Divider sx={{ my: 3 }} />

        {replyError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {replyError}
          </Alert>
        )}
        <TextField
          label="Write a reply"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          fullWidth
          multiline
          minRows={3}
          inputProps={{ maxLength: 5000 }}
        />
        <Box
          sx={{
            mt: 1,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {isStaff ? (
            <FormControlLabel
              control={
                <Checkbox
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                />
              }
              label="Internal note (hidden from customer)"
            />
          ) : (
            <span />
          )}
          <Button variant="contained" onClick={handleReply} disabled={replying}>
            {replying ? <CircularProgress size={20} /> : "Send Reply"}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
