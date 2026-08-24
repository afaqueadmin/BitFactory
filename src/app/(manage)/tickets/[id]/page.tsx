"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Box, Button, TextField, MenuItem, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useUser } from "@/lib/hooks/useUser";
import { useTicket } from "@/lib/hooks/useTickets";
import TicketThreadView from "@/components/tickets/TicketThreadView";

interface StaffOption {
  id: string;
  name: string | null;
  email: string;
}

function AssignControl({ ticketId }: { ticketId: string }) {
  const { ticket, assign, assigning } = useTicket(ticketId);
  const [staff, setStaff] = useState<StaffOption[]>([]);

  useEffect(() => {
    fetch("/api/admin/staff", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((body) => setStaff(body.data || []))
      .catch(() => setStaff([]));
  }, []);

  if (!ticket) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <TextField
        select
        size="small"
        label="Assign to"
        value={ticket.assignedTo?.id || ""}
        onChange={(e) => assign(e.target.value || null)}
        disabled={assigning}
        sx={{ minWidth: 260 }}
      >
        <MenuItem value="">Unassigned (shared queue)</MenuItem>
        {staff.map((s) => (
          <MenuItem key={s.id} value={s.id}>
            {s.name || s.email}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  );
}

export default function AdminTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();

  if (!user) return null;

  return (
    <Box sx={{ p: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push("/tickets")}
        sx={{ mb: 2 }}
      >
        Back to Tickets
      </Button>
      <TicketThreadView
        ticketId={params.id}
        currentUserId={user.id || ""}
        currentUserRole={user.role}
        headerExtra={
          user.role === "SUPER_ADMIN" ? (
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 1 }}
              >
                Assignment (super admin only)
              </Typography>
              <AssignControl ticketId={params.id} />
            </Box>
          ) : undefined
        }
      />
    </Box>
  );
}
