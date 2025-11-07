"use client";

import React from "react";
import { Box, Typography, Button, useTheme, Stack, Paper } from "@mui/material";
import Link from "next/link";
import Image from "next/image";

export default function Home() {
  const theme = useTheme();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        px: 2,
        py: { xs: 6, md: 10 },
        bgcolor: "background.default",
      }}
    >
      <Paper
        elevation={3}
        sx={{
          maxWidth: 600,
          width: "100%",
          mx: "auto",
          p: { xs: 5, md: 7 },
          bgcolor: "background.paper",
          borderRadius: 5,
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: "0px 4px 20px rgba(0,0,0,0.1)",
        }}
      >
        <Stack spacing={0} alignItems="center">
          <Box>
            <Image
              src="/BitfactoryLogo.webp"
              alt="Bitfactory logo"
              width={220}
              height={0}
              priority
              style={{
                borderRadius: 16,
                display: "block",
                objectFit: "contain",
              }}
            />
          </Box>

          <Typography
            variant="h5"
            fontWeight={500}
            mb={4}
            sx={{ color: theme.palette.text.primary }}
          >
            Welcome
          </Typography>

          <Typography
            variant="body1"
            mb={4}
            sx={{ color: "text.secondary", maxWidth: 500 }}
          >
            Login to your Bitcoin mining dashboard and manage your mining
            operations easily and securely.
          </Typography>

          <Button
            variant="contained"
            color="primary"
            size="large"
            component={Link}
            href="/login"
            sx={{
              px: 6,
              py: 1.5,
              fontSize: 16,
              borderRadius: 3,
              transition: "0.3s",
              "&:hover": {
                transform: "scale(1.05)",
                boxShadow: "0px 4px 15px rgba(0,0,0,0.2)",
              },
            }}
          >
            Login
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
