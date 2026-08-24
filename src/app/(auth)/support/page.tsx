"use client";

import React, { useState } from "react";
import { Box, Typography, Button, Stack } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useTickets } from "@/lib/hooks/useTickets";
import { useUser } from "@/lib/hooks/useUser";
import TicketListTable from "@/components/tickets/TicketListTable";
import CreateTicketModal from "@/components/tickets/CreateTicketModal";

export default function SupportPage() {
  const { tickets, loading, error } = useTickets();
  const { user } = useUser();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <Box sx={{ p: 4 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Support
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Raise a ticket or track your existing requests.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
        >
          Raise a Ticket
        </Button>
      </Stack>

      <TicketListTable
        tickets={tickets}
        loading={loading}
        error={error}
        detailBasePath="/support"
        showRaisedBy
        showPriority={user?.role !== "CLIENT"}
      />

      <CreateTicketModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        detailBasePath="/support"
      />
    </Box>
  );
}
