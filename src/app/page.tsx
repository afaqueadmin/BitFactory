"use client";

/**
 * Welcome / landing page - BitFactory Daylight theme (v1.3)
 *
 * Public, unauthenticated entry point: pale canvas background, a single
 * centred Daylight card with the brand mark and a Login call to action.
 */

import React from "react";
import { Box, Typography, Button, Stack } from "@mui/material";
import Link from "next/link";
import Image from "next/image";
import { RADIUS_CARD, logoFilter, useDaylight } from "@/lib/daylight";

export default function Home() {
  const { d, darkMode, fonts } = useDaylight();

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
        bgcolor: d.canvas,
        fontFamily: fonts.body,
      }}
    >
      <Box
        sx={{
          maxWidth: 600,
          width: "100%",
          mx: "auto",
          p: { xs: 5, md: 7 },
          bgcolor: d.surface,
          borderRadius: RADIUS_CARD,
          border: `1px solid ${d.border}`,
          boxShadow: d.shadow,
        }}
      >
        <Stack spacing={0} alignItems="center">
          <Box>
            <Image
              src="/BitfactoryLogo.webp"
              alt="Bitfactory logo"
              width={250}
              height={125}
              priority
              style={{
                height: "auto",
                borderRadius: 16,
                display: "block",
                objectFit: "contain",
                filter: logoFilter(darkMode),
              }}
            />
          </Box>

          <Typography
            mb={4}
            sx={{
              fontSize: { xs: 18, sm: 20 },
              color: d.muted,
              maxWidth: 500,
              mt: 2,
            }}
          >
            Login to your Bitcoin mining Factory
          </Typography>

          <Button
            component={Link}
            href="/login"
            size="large"
            sx={{
              px: 6,
              py: 1.5,
              fontSize: 16,
              fontWeight: 650,
              textTransform: "none",
              borderRadius: "8px",
              color: "#fff",
              bgcolor: d.action,
              boxShadow: "none",
              transition: "0.2s",
              "&:hover": {
                bgcolor: d.actionHover,
                boxShadow: "none",
                transform: "scale(1.03)",
              },
            }}
          >
            Login
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
