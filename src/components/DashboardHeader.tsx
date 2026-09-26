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
import BtcPriceLabel from "@/components/BtcPriceLabel";
import { useDaylight } from "@/lib/daylight";

export default function DashboardHeader({
  daylight = false,
}: {
  /** Render with the Daylight page-heading styling (guide §2). */
  daylight?: boolean;
}) {
  const { user, loading } = useUser();
  const { d, fonts } = useDaylight();

  if (daylight) {
    return (
      <Box
        component="section"
        aria-labelledby="dashboard-greeting"
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
          mb: { xs: "20px", md: "26px" },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            id="dashboard-greeting"
            component="h1"
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 750,
              fontSize: { xs: 27, md: 32 },
              lineHeight: 1.3,
              letterSpacing: "-.035em",
              color: d.text,
              overflowWrap: "anywhere",
            }}
          >
            {loading ? (
              <Skeleton width={220} />
            ) : (
              <>
                Hello,&nbsp;
                <Box component="span" sx={{ color: d.action }}>
                  {user?.name || "Guest"}
                </Box>
              </>
            )}
          </Typography>
          <Typography
            sx={{
              fontFamily: fonts.body,
              fontSize: { xs: 12, md: 13 },
              lineHeight: { xs: 1.7, md: 1.5 },
              color: d.muted,
              mt: "7px",
            }}
          >
            Here&rsquo;s how your mining operation is doing today.
          </Typography>
        </Box>

        <BtcPriceLabel daylight />
      </Box>
    );
  }

  return (
    <Box
      component="section"
      aria-labelledby="dashboard-greeting"
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 1.5,
        mb: { xs: 1.5, md: 3 },
        mt: { xs: 1, md: 2 },
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
            fontSize: { xs: "1.4rem", sm: "2.25rem", md: "3.25rem" },
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

      <BtcPriceLabel />

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
