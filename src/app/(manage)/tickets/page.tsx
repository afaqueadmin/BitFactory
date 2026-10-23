"use client";

import React, { useState } from "react";
import { Stack, TextField, MenuItem } from "@mui/material";
import {
  DaylightAdminPage,
  DaylightPageHeader,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import { useTickets } from "@/lib/hooks/useTickets";
import TicketListTable from "@/components/tickets/TicketListTable";
import { TICKET_STATUSES, TICKET_STATUS_LABELS } from "@/lib/constants/tickets";

export default function AdminTicketsPage() {
  const ds = useDaylightAdminSx();
  const [status, setStatus] = useState("");
  const { tickets, loading, error } = useTickets(
    status ? { status } : undefined,
  );

  return (
    <DaylightAdminPage>
      <DaylightPageHeader
        title="Support Tickets"
        description="Every ticket raised by a client or franchisee, across all franchises."
      />

      <Stack direction="row" sx={{ mb: 3 }}>
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 220, ...ds.inputSx }}
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
        daylight
      />
    </DaylightAdminPage>
  );
}
