// src/components/DashboardHeader.tsx
"use client";

/**
 * DashboardHeader
 * - Renders the large greeting and centered filter chips (pills).
 * - Fully responsive: chips wrap on small screens.
 *
 * Props: none (this component is presentational).
 *
 * Uses MUI components and respects theme (dark/light).
 */

import React from "react";
import { Box, Typography, Skeleton } from "@mui/material";
import { useUser } from "@/lib/hooks/useUser";

export default function DashboardHeader() {
  const { user, loading } = useUser();

  return (
    <Box
      component="section"
      aria-labelledby="dashboard-greeting"
      sx={{
        display: "flex",
        mb: { xs: 2, md: 3 },
        mt: { xs: 2, md: 2 },
      }}
    >
      {/* Greeting box - top right, compact */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Typography
          id="dashboard-greeting"
          variant="body1"
          component="span"
          sx={{
            fontWeight: 600,
            fontSize: { xs: "1.6rem", sm: "2.75rem", md: "3.25rem" },
          }}
        >
          {loading ? (
            <Skeleton width={100} height={24} />
          ) : (
            <>
              Hello,&nbsp;
              <Box
                component="span"
                sx={{
                  color: "primary.main",
                  display: "inline-block",
                  fontWeight: 700,
                }}
              >
                {user?.name || "Guest"}
              </Box>
            </>
          )}
        </Typography>
      </Box>

      {/* Centered chip filters */}
      {/* commented to hide these for now will be removed soon */}
      {/* <Stack
                direction="row"
                spacing={1.5}
                justifyContent="center"
                alignItems="center"
                sx={{ 
                    flexWrap: "wrap", 
                    gap: { xs: 1.5, md: 2 },
                    mt: { xs: 3, md: 4 }
                }}
                role="tablist"
                aria-label="dashboard filters"
            >
                <Chip
                    label="Electricity"
                    clickable
                    variant="filled"
                    color="primary"
                    aria-pressed="false"
                />
                <Chip label="Network" clickable variant="outlined" />
                <Chip label="Temperature" clickable variant="outlined" />
            </Stack> */}
    </Box>
  );
}
