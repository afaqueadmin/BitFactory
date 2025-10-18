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
import { Box, Typography, Stack, Chip, Skeleton } from "@mui/material";
import { useUser } from "@/lib/hooks/useUser";

export default function DashboardHeader() {
    const { user, loading, error } = useUser();

    // Format the greeting based on time of day
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good Morning";
        if (hour < 18) return "Good Afternoon";
        return "Good Evening";
    };

    return (
        <Box
            component="section"
            aria-labelledby="dashboard-greeting"
            sx={{
                textAlign: "center",
                mb: { xs: 4, md: 5 },
                mt: { xs: 3, md: 4 },
                py: { xs: 2, md: 3                                           },
            }}
        >
            {/* Large greeting */}
            <Typography
                id="dashboard-greeting"
                variant="h3"
                component="h1"
                sx={{
                    fontWeight: 700,
                    mb: { xs: 3, md: 4 },
                    lineHeight: 1.2,
                    // Responsive font sizing
                    fontSize: { xs: "1.6rem", sm: "2.2rem", md: "2.6rem" },
                }}
            >
                {loading ? (
                    <Skeleton 
                        width="80%" 
                        sx={{ 
                            mx: 'auto',
                            height: { xs: '2rem', sm: '2.75rem', md: '3.25rem' }
                        }} 
                    />
                ) : (
                    <>
                        {getGreeting()},{' '}
                        <Box 
                            component="span" 
                            sx={{ 
                                color: 'primary.main',
                                display: 'inline-block',
                            }}
                        >
                            {user?.name || 'Guest'}
                        </Box>
                    </>
                )}
            </Typography>

            {/* Centered chip filters */}
            <Stack
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
            </Stack>
        </Box>
    );
}
