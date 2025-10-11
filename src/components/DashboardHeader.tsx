"use client";

import React, { useState, useEffect } from "react";
import { Box, Typography, Stack, Chip } from "@mui/material";
import { useUser } from "@/lib/hooks/useUser";

export default function DashboardHeader() {
    const { user, loading, error } = useUser();
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
        setMounted(true);
    }, []);

    // Don't show anything until after hydration
    if (!mounted) {
        return null;
    }

    // Get time-based greeting
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
                py: { xs: 2, md: 3 },
            }}
        >
            <Typography
                id="dashboard-greeting"
                variant="h3"
                component="h1"
                sx={{
                    fontWeight: 700,
                    mb: { xs: 3, md: 4 },
                    lineHeight: 1.2,
                    fontSize: { xs: "1.6rem", sm: "2.2rem", md: "2.6rem" },
                }}
            >
                {error ? (
                    <Box sx={{ color: 'text.secondary' }}>
                        Welcome Back
                    </Box>
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