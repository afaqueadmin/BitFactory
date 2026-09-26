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
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

interface TicketThreadViewProps {
  ticketId: string;
  currentUserId: string;
  currentUserRole: "ADMIN" | "SUPER_ADMIN" | "CLIENT" | "FRANCHISEE";
  /** Extra content rendered above the thread (e.g. an assignment control, admin-only). */
  headerExtra?: React.ReactNode;
  daylight?: boolean;
}

export default function TicketThreadView({
  ticketId,
  currentUserId,
  currentUserRole,
  headerExtra,
  daylight = false,
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
  const [statusError, setStatusError] = useState<string | null>(null);
  const { d, fonts } = useDaylight();

  // Priority + internal notes stay a "staff" concept (ADMIN/SUPER_ADMIN/
  // FRANCHISEE). Status is narrower: FRANCHISEE can raise/reply but never
  // manually changes status - only ADMIN/SUPER_ADMIN can, plus a CLIENT
  // self-closing their own ticket (handled separately below).
  const isStaff =
    currentUserRole === "ADMIN" ||
    currentUserRole === "SUPER_ADMIN" ||
    currentUserRole === "FRANCHISEE";
  const canManageStatus =
    currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN";

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={daylight ? { color: d.action } : undefined} />
      </Box>
    );
  }

  if (error || !ticket) {
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
          {error || "Ticket not found"}
        </Box>
      );
    }
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

  const handleStatusChange = async (newStatus: string) => {
    setStatusError(null);
    try {
      await updateStatus(newStatus);
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : "Failed to update status",
      );
    }
  };

  if (!daylight) {
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

          {(canManageStatus || isStaff) && (
            <Box
              sx={{
                mt: 2,
                display: "flex",
                gap: 2,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {canManageStatus && (
                <TextField
                  select
                  size="small"
                  label="Status"
                  value={ticket.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={updatingStatus}
                  sx={{ minWidth: 220 }}
                >
                  {TICKET_STATUSES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {TICKET_STATUS_LABELS[s]}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {isStaff && (
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
              )}
            </Box>
          )}
          {statusError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {statusError}
            </Alert>
          )}
          {currentUserRole === "CLIENT" && canClose && (
            <Box sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                size="small"
                disabled={updatingStatus}
                onClick={() => handleStatusChange("CLOSED")}
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
            <Button
              variant="contained"
              onClick={handleReply}
              disabled={replying}
            >
              {replying ? <CircularProgress size={20} /> : "Send Reply"}
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  const cardSx = {
    bgcolor: d.surface,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS_CARD,
    boxShadow: d.shadow,
    p: 3,
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
    "& .MuiInputLabel-root": { fontFamily: fonts.body, color: d.muted },
  };

  const alertSx = (tone: "success" | "error") => ({
    borderRadius: "8px",
    bgcolor: tone === "success" ? d.mint : d.dangerSoft,
    color: tone === "success" ? d.success : d.danger,
    fontFamily: fonts.body,
    "& .MuiAlert-icon": { color: tone === "success" ? d.success : d.danger },
  });

  const primaryBtnSx = {
    textTransform: "none",
    fontFamily: fonts.body,
    fontWeight: 650,
    borderRadius: "8px",
    minHeight: 40,
    bgcolor: d.action,
    color: "#fff",
    boxShadow: "none",
    "&:hover": { bgcolor: d.actionHover, boxShadow: "none" },
    "&.Mui-disabled": { bgcolor: d.border, color: d.muted },
  } as const;

  const outlineBtnSx = {
    textTransform: "none",
    fontFamily: fonts.body,
    fontWeight: 600,
    borderRadius: "8px",
    minHeight: 36,
    color: d.text,
    borderColor: d.inputBorder,
    "&:hover": { bgcolor: d.hover, borderColor: d.action },
  } as const;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={cardSx}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          flexWrap="wrap"
          gap={2}
        >
          <Box>
            <Typography
              sx={{
                fontFamily: fonts.heading,
                fontWeight: 700,
                fontSize: 18,
                color: d.text,
              }}
            >
              {ticket.subject}
            </Typography>
            <Typography
              sx={{
                fontFamily: fonts.body,
                fontSize: 12.5,
                color: d.muted,
                mt: "4px",
              }}
            >
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
              sx={{
                fontFamily: fonts.body,
                fontWeight: 600,
                bgcolor: d.hover,
                color: d.text,
              }}
            />
            {isStaff && ticket.priority && (
              <TicketPriorityBadge priority={ticket.priority} daylight />
            )}
            <TicketStatusBadge status={ticket.status} daylight />
          </Stack>
        </Stack>

        {(canManageStatus || isStaff) && (
          <Box
            sx={{
              mt: 2,
              display: "flex",
              gap: 2,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {canManageStatus && (
              <TextField
                select
                size="small"
                label="Status"
                value={ticket.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={updatingStatus}
                sx={{ minWidth: 220, ...inputSx }}
              >
                {TICKET_STATUSES.map((s) => (
                  <MenuItem key={s} value={s} sx={{ fontFamily: fonts.body }}>
                    {TICKET_STATUS_LABELS[s]}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {isStaff && (
              <TextField
                select
                size="small"
                label="Priority"
                value={ticket.priority || "NORMAL"}
                onChange={(e) => updatePriority(e.target.value)}
                disabled={updatingPriority}
                sx={{ minWidth: 160, ...inputSx }}
              >
                {TICKET_PRIORITIES.map((p) => (
                  <MenuItem key={p} value={p} sx={{ fontFamily: fonts.body }}>
                    {TICKET_PRIORITY_LABELS[p]}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Box>
        )}
        {statusError && (
          <Alert severity="error" sx={{ mt: 2, ...alertSx("error") }}>
            {statusError}
          </Alert>
        )}
        {currentUserRole === "CLIENT" && canClose && (
          <Box sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              size="small"
              disabled={updatingStatus}
              onClick={() => handleStatusChange("CLOSED")}
              sx={outlineBtnSx}
            >
              Mark as resolved / close ticket
            </Button>
          </Box>
        )}

        {headerExtra}
      </Box>

      <Box sx={cardSx}>
        <Typography
          sx={{
            fontFamily: fonts.heading,
            fontWeight: 700,
            fontSize: 15,
            color: d.text,
            mb: 2,
          }}
        >
          Conversation
        </Typography>
        <Stack divider={<Divider sx={{ borderColor: d.border }} />} spacing={2}>
          {ticket.messages.map((msg) => {
            const isMine = msg.authorId === currentUserId;
            return (
              <Box key={msg.id}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography
                    sx={{
                      fontFamily: fonts.body,
                      fontWeight: 600,
                      fontSize: 13,
                      color: d.text,
                    }}
                  >
                    {msg.isSystemGenerated
                      ? "System"
                      : msg.author?.name || msg.author?.email || "Unknown"}
                    {isMine && !msg.isSystemGenerated && " (you)"}
                    {msg.isInternal && (
                      <Chip
                        label="Internal note"
                        size="small"
                        variant="outlined"
                        sx={{
                          ml: 1,
                          fontFamily: fonts.body,
                          fontWeight: 600,
                          borderColor: d.border,
                          color: d.muted,
                        }}
                      />
                    )}
                  </Typography>
                  <Typography
                    sx={{
                      fontFamily: fonts.body,
                      fontSize: 11.5,
                      color: d.muted,
                    }}
                  >
                    {new Date(msg.createdAt).toLocaleString()}
                  </Typography>
                </Stack>
                <Typography
                  sx={{
                    mt: 0.5,
                    whiteSpace: "pre-wrap",
                    fontFamily: fonts.body,
                    fontSize: 13,
                    color: d.text,
                  }}
                >
                  {msg.body}
                </Typography>
              </Box>
            );
          })}
        </Stack>

        <Divider sx={{ my: 3, borderColor: d.border }} />

        {replyError && (
          <Alert severity="error" sx={{ mb: 2, ...alertSx("error") }}>
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
          sx={inputSx}
        />
        <Box
          sx={{
            mt: 1,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1,
          }}
        >
          {isStaff ? (
            <FormControlLabel
              control={
                <Checkbox
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  sx={{ color: d.muted, "&.Mui-checked": { color: d.action } }}
                />
              }
              label="Internal note (hidden from customer)"
              sx={{
                "& .MuiFormControlLabel-label": {
                  fontFamily: fonts.body,
                  fontSize: 13,
                  color: d.text,
                },
              }}
            />
          ) : (
            <span />
          )}
          <Button
            variant="contained"
            onClick={handleReply}
            disabled={replying}
            sx={primaryBtnSx}
          >
            {replying ? (
              <CircularProgress size={20} sx={{ color: "#fff" }} />
            ) : (
              "Send Reply"
            )}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
