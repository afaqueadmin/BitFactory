"use client";

import { Box, Typography } from "@mui/material";
import {
  RepairMiner,
  repairMinerLocation,
} from "@/lib/hooks/useRepairInvoices";

/** Serial No., Name, Model and Location of the miner on a repair invoice. */
export function RepairMinerDetails({ miner }: { miner: RepairMiner }) {
  const fields: Array<[string, string]> = [
    ["Serial No.", miner.serialNumber || "—"],
    ["Name", miner.name],
    ["Model", miner.hardware?.model || "—"],
    ["Location", repairMinerLocation(miner)],
  ];

  return (
    <Box
      sx={{
        p: 2,
        backgroundColor: "#f5f5f5",
        borderRadius: 1,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
        gap: 1.5,
      }}
    >
      {fields.map(([label, value]) => (
        <Box key={label}>
          <Typography variant="caption" color="textSecondary">
            {label}
          </Typography>
          <Typography sx={{ fontWeight: 500, wordBreak: "break-word" }}>
            {value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
