"use client";

import Link from "next/link";
import { Alert, Button } from "@mui/material";
import { useUser } from "@/lib/hooks/useUser";

/**
 * Shown to simulated (SIMULATED) accounts on every client page, so it's always
 * clear the figures are simulated and nothing is billed.
 */
export default function SimulatedAccountBanner() {
  const { user } = useUser();
  if (user?.role !== "SIMULATED") return null;

  return (
    <Alert
      severity="info"
      sx={{ mb: 2.5, alignItems: "center" }}
      action={
        <Button
          component={Link}
          href="/support"
          color="inherit"
          size="small"
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          Talk to sales
        </Button>
      }
    >
      <strong>Simulated account.</strong> These figures come from a real
      Bitfactory miner since you signed up; the balance and charges are
      simulated and nothing is billed.
    </Alert>
  );
}
