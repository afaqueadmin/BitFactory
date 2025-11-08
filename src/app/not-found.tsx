// src/app/not-found.tsx
"use client";

import { Box, Typography, Button } from "@mui/material";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      gap={2}
    >
      <Typography variant="h1">404</Typography>
      <Typography variant="h5">Page Not Found</Typography>
      <Typography variant="body1">
        The requested page doesn&#39;t exist.
      </Typography>
      <Button variant="contained" onClick={() => router.back()}>
        Go Back
      </Button>
    </Box>
  );
}
