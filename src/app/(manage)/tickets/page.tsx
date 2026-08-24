"use client";

import React, { useState } from "react";
import { Box, Typography, Stack, TextField, MenuItem } from "@mui/material";
import { useTickets } from "@/lib/hooks/useTickets";
import TicketListTable from "@/components/tickets/TicketListTable";
import { TICKET_STATUSES, TICKET_STATUS_LABELS } from "@/lib/constants/tickets";

export default function AdminTicketsPage() {
  const [status, setStatus] = useState("");
  const { tickets, loading, error } = useTickets(
    status ? { status } : undefined,
  );

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
        Support Tickets
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Every ticket raised by a client or franchisee, across all franchises.
      </Typography>

      <Stack direction="row" sx={{ mb: 3 }}>
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {TICKET_STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {TICKET_STATUS_LABELS[s]}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <TicketListTable
        tickets={tickets}
        loading={loading}
        error={error}
        detailBasePath="/tickets"
        showRaisedBy
        showFranchise
        showAssignee
      />
    </Box>
  );
}
