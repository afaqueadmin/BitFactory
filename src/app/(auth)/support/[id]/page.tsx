"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { Box, Button } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useUser } from "@/lib/hooks/useUser";
import TicketThreadView from "@/components/tickets/TicketThreadView";
import { useDaylight } from "@/lib/daylight";

export default function SupportTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { d, fonts } = useDaylight();

  if (!user) return null;

  return (
    <Box
      sx={{ maxWidth: 1600, mx: "auto", fontFamily: fonts.body, color: d.text }}
    >
      <Button
        startIcon={<ArrowBackIcon sx={{ fontSize: 18 }} />}
        onClick={() => router.push("/support")}
        sx={{
          mb: 2,
          textTransform: "none",
          fontFamily: fonts.body,
          fontWeight: 600,
          fontSize: 12.5,
          color: d.text,
          "&:hover": { bgcolor: d.hover },
        }}
      >
        Back to Support
      </Button>
      <TicketThreadView
        ticketId={params.id}
        currentUserId={user.id || ""}
        currentUserRole={user.role}
        daylight
      />
    </Box>
  );
}
