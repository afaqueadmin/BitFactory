"use client";

import { Alert } from "@mui/material";
import { useUser } from "@/lib/hooks/useUser";

/**
 * Shown to simulated (SIMULATED) accounts on every client page, so it's always
 * clear where the figures come from.
 */
export default function SimulatedAccountBanner() {
  const { user } = useUser();
  if (user?.role !== "SIMULATED") return null;

  return (
    <Alert severity="info" sx={{ mb: 2.5, alignItems: "center" }}>
      <strong>Simulated Account:</strong> The figures come from a real
      Bitfactory miner and are updated daily.
    </Alert>
  );
}
