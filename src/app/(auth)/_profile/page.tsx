"use client";

import { Box, Typography, Paper } from "@mui/material";

export default function Profile() {
  return (
    <Box sx={{ p: 3, mt: 2, minHeight: "100vh" }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Profile
      </Typography>
      <Paper sx={{ p: 3, mt: 2 }}>
        <Typography>
          User profile information and settings will appear here.
        </Typography>
      </Paper>
    </Box>
  );
}
