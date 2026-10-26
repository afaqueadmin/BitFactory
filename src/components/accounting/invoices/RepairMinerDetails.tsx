"use client";

import { Alert, Box, Typography } from "@mui/material";
import {
  RepairMiner,
  repairMinerLocation,
} from "@/lib/hooks/useRepairInvoices";
import {
  formatWarrantyDate,
  getWarrantyStatus,
  WARRANTY_STATUS_LABEL,
} from "@/lib/minerWarranty";
import { useDaylight } from "@/lib/daylight";

/**
 * Serial No., Name, Model and Location of the miner on a repair invoice.
 * showWarranty adds its manufacturer warranty status - only on the invoice
 * form, so it's never frozen into an issued customer document.
 */
export function RepairMinerDetails({
  miner,
  showWarranty = false,
  daylight = false,
}: {
  miner: RepairMiner;
  showWarranty?: boolean;
  /** Daylight styling (client invoice page); admin keeps the MUI look. */
  daylight?: boolean;
}) {
  const { d, fonts } = useDaylight();
  const fields: Array<[string, string]> = [
    ["Serial No.", miner.serialNumber || "—"],
    ["Name", miner.name],
    ["Model", miner.hardware?.model || "—"],
    ["Location", repairMinerLocation(miner)],
  ];

  const warrantyStatus = getWarrantyStatus(miner.warrantyExpiresAt);
  if (showWarranty) {
    fields.push([
      "Warranty",
      warrantyStatus === "NONE"
        ? WARRANTY_STATUS_LABEL.NONE
        : `${formatWarrantyDate(miner.warrantyExpiresAt)} (${WARRANTY_STATUS_LABEL[warrantyStatus]})`,
    ]);
  }
  const underWarranty =
    showWarranty &&
    (warrantyStatus === "ACTIVE" || warrantyStatus === "EXPIRING");

  return (
    <Box>
      {underWarranty && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          This miner is under manufacturer warranty until{" "}
          {formatWarrantyDate(miner.warrantyExpiresAt)}.
        </Alert>
      )}
      <Box
        sx={{
          p: 2,
          backgroundColor: daylight ? d.canvas : "#f5f5f5",
          borderRadius: daylight ? "10px" : 1,
          ...(daylight && {
            border: `1px solid ${d.border}`,
            fontFamily: fonts.body,
          }),
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 1.5,
        }}
      >
        {fields.map(([label, value]) => (
          <Box key={label}>
            <Typography
              variant="caption"
              sx={
                daylight
                  ? { fontFamily: fonts.body, fontSize: 12, color: d.muted }
                  : { color: "text.secondary" }
              }
            >
              {label}
            </Typography>
            <Typography
              sx={{
                fontWeight: daylight ? 600 : 500,
                wordBreak: "break-word",
                ...(daylight && {
                  fontFamily: fonts.body,
                  fontSize: 14,
                  color: d.text,
                }),
              }}
            >
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
