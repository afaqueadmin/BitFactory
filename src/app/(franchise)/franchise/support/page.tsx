"use client";

import React, { useState } from "react";
import { Box, Typography, Button, Stack } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useTickets } from "@/lib/hooks/useTickets";
import TicketListTable from "@/components/tickets/TicketListTable";
import CreateTicketModal from "@/components/tickets/CreateTicketModal";

export default function FranchiseSupportPage() {
  const { tickets, loading, error } = useTickets();
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
            Tickets raised by you and by your onboarded customers. BitFactory
            admin can see and respond to these too.
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
        detailBasePath="/franchise/support"
        showRaisedBy
      />

      <CreateTicketModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        detailBasePath="/franchise/support"
      />
    </Box>
  );
}
