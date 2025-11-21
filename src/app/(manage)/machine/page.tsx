"use client";

import { Box, Container, Typography } from "@mui/material";

export default function MachinePage() {
  return (
    <Box
      component="main"
      sx={{ py: 4, backgroundColor: "background.default", minHeight: "100vh" }}
    >
      <Container maxWidth="xl">
        <Typography variant="h3" component="h1" sx={{ fontWeight: "bold" }}>
          Machines Management
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Machine management coming soon...
        </Typography>
      </Container>
    </Box>
  );
}
