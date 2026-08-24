"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { Box, Button } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useUser } from "@/lib/hooks/useUser";
import TicketThreadView from "@/components/tickets/TicketThreadView";

export default function SupportTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();

  if (!user) return null;

  return (
    <Box sx={{ p: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push("/support")}
        sx={{ mb: 2 }}
      >
        Back to Support
      </Button>
      <TicketThreadView
        ticketId={params.id}
        currentUserId={user.id || ""}
        currentUserRole={user.role}
      />
    </Box>
  );
}
