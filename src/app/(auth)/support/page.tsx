"use client";

/**
 * Support page (authenticated) - BitFactory Daylight theme (v1.3)
 *
 * Composes:
 * - Page heading + "Raise a Ticket" button
 * - Daylight ticket list table (guide-style header row, soft-tone pills)
 *
 * CreateTicketModal is a genuine overlay shared with the franchise support
 * page and stays on its current MUI styling.
 */

import React, { useState } from "react";
import { Box, Typography, Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useTickets } from "@/lib/hooks/useTickets";
import { useUser } from "@/lib/hooks/useUser";
import TicketListTable from "@/components/tickets/TicketListTable";
import CreateTicketModal from "@/components/tickets/CreateTicketModal";
import { useDaylight } from "@/lib/daylight";

export default function SupportPage() {
  const { tickets, loading, error } = useTickets();
  const { user } = useUser();
  const [createOpen, setCreateOpen] = useState(false);
  const { d, fonts } = useDaylight();

  return (
    <Box
      sx={{ maxWidth: 1600, mx: "auto", fontFamily: fonts.body, color: d.text }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
          mb: { xs: "20px", md: "26px" },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 750,
              fontSize: { xs: 27, md: 32 },
              lineHeight: 1.3,
              letterSpacing: "-.035em",
              color: d.text,
            }}
          >
            Support
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: 12, md: 13 },
              lineHeight: { xs: 1.7, md: 1.5 },
              color: d.muted,
              mt: "7px",
            }}
          >
            Raise a ticket or track your existing requests.
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<AddIcon sx={{ fontSize: 18 }} />}
          onClick={() => setCreateOpen(true)}
          sx={{
            textTransform: "none",
            fontFamily: fonts.body,
            fontWeight: 650,
            fontSize: 12,
            minHeight: 42,
            borderRadius: "8px",
            bgcolor: d.action,
            color: "#fff",
            boxShadow: "none",
            px: "16px",
            width: { xs: "100%", sm: "auto" },
            "&:hover": { bgcolor: d.actionHover, boxShadow: "none" },
          }}
        >
          Raise a Ticket
        </Button>
      </Box>

      <TicketListTable
        tickets={tickets}
        loading={loading}
        error={error}
        detailBasePath="/support"
        showRaisedBy
        showPriority={user?.role !== "CLIENT"}
        daylight
      />

      <CreateTicketModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        detailBasePath="/support"
      />
    </Box>
  );
}
