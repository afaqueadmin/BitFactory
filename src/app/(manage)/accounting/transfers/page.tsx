"use client";

import { Box, Paper, Typography } from "@mui/material";
import { TransfersTab } from "@/components/accounting/bankTransfer/TransfersTab";
import {
  DaylightAdminPage,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";

export default function TransfersPage() {
  const ds = useDaylightAdminSx();
  return (
    <DaylightAdminPage>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={ds.pageTitleSx}>
          Transfers
        </Typography>
        <Typography sx={ds.pageDescSx}>
          Money moved between our own banks. Each transfer is a Credit on the
          sending bank and a Debit on the receiving bank, at the same USD value;
          each bank&apos;s fee is its own Credit row.
        </Typography>
      </Box>
      <Paper elevation={0} sx={{ ...ds.listCardSx, p: { xs: 2, sm: 3 } }}>
        <TransfersTab />
      </Paper>
    </DaylightAdminPage>
  );
}
