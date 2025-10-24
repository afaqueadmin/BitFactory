    // src/app/(auth)/dashboard/page.tsx
    "use client";

    /**
     * Dashboard page (authenticated)
     *
     * Composes:
     * - DashboardHeader
     * - HostedMinersCard
     * - MarketplaceCard
     * - Four GradientStatCard instances
     *
     * Notes:
     * - This page provides demo/hardcoded values for now.
     * - Individual components are fully data-driven via props.
     *
     * Layout:
     * - Container maxWidth="lg"
     * - Grid breakpoints used to meet responsive requirements
     */

    import React from "react";
    import { Container, Grid, Box, Typography, CircularProgress, Alert } from "@mui/material";
    import DashboardHeader from "@/components/DashboardHeader";
    import HostedMinersCard from "@/components/HostedMinersCard";
    import MarketplaceCard from "@/components/MarketplaceCard";
    import GradientStatCard from "@/components/GradientStatCard";
    import EuroSymbolIcon from "@mui/icons-material/EuroSymbol";
    import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
    import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
    import ShowChartIcon from "@mui/icons-material/ShowChart";
    import MiningEarningsChart from "@/components/MiningEarningsChart";
    import { useUser } from "@/lib/hooks/useUser";

    
    export default function DashboardPage() {
        const { user, recentActivities, loading, error } = useUser();
        
        // demo/hardcoded values (page-level only)
        const hosted = {
            runningCount: 3,
            progress: 66,
            errorCount: 2,
        };

        const marketplace = {
            runningCount: 0,
            comingSoon: true,
        };

        if (loading) {
            return (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                    <CircularProgress />
                </Box>
            );
        }

        if (error) {
            return (
                <Box sx={{ p: 2 }}>
                    <Alert severity="error">{error}</Alert>
                </Box>
            );
        }

        return (
            <Box component="main" sx={{ pt: 2, pb: 4 }}>
                <Container maxWidth="xl">
                    {/* Header */}
                    <DashboardHeader />

                    {/* Top two horizontal cards - 50/50 split */}
                    <Box sx={{ display: 'flex', gap: 4, mb: 2, flexDirection: { xs: 'column', md: 'row' } }}>
                        <Box sx={{ flex: 1 }}>
                            {/* Hosted miners: 50% width on desktop */}
                            <HostedMinersCard
                                runningCount={hosted.runningCount}
                                progress={hosted.progress}
                                errorCount={hosted.errorCount}
                                onAddMiner={() => {
                                    // stub for now, later wire to modal / route
                                    console.log("ADD MINER clicked from DashboardPage");
                                }}
                            />
                        </Box>

                        <Box sx={{ flex: 1 }}>
                            {/* Marketplace card: 50% width on desktop */}
                            <MarketplaceCard
                                runningCount={marketplace.runningCount}
                                comingSoon={marketplace.comingSoon}
                            />
                        </Box>
                    </Box>

                    {/* 4 gradient stat cards - Full width, 25% each */}
                    <Box sx={{ display: 'flex', gap: 3, mb: 2, flexDirection: { xs: 'column', sm: 'row' }, flexWrap: { xs: 'nowrap', sm: 'wrap', md: 'nowrap' } }}>
                        <Box sx={{ flex: { xs: 1, md: '1 1 25%' }, minWidth: 0 }}>
                            <GradientStatCard
                                title="EUR Account"
                                value="€ 0.00"
                                caption="yesterday"
                                gradient="linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)"
                                icon={<EuroSymbolIcon fontSize="small" />}
                            />
                        </Box>

                        <Box sx={{ flex: { xs: 1, md: '1 1 25%' }, minWidth: 0 }}>
                            <GradientStatCard
                                title="COSTS"
                                value="€ 12.34"
                                caption="yesterday"
                                gradient="linear-gradient(135deg, #00BFA6 0%, #1DE9B6 100%)"
                                icon={<AttachMoneyIcon fontSize="small" />}
                            />
                        </Box>

                        <Box sx={{ flex: { xs: 1, md: '1 1 25%' }, minWidth: 0 }}>
                            <GradientStatCard
                                title="Estimated mining days left"
                                value="7 days"
                                caption="days"
                                gradient="linear-gradient(135deg, #2196F3 0%, #21CBF3 100%)"
                                icon={<CalendarTodayIcon fontSize="small" />}
                            />
                        </Box>
    
                        <Box sx={{ flex: { xs: 1, md: '1 1 25%' }, minWidth: 0 }}>
                            <GradientStatCard
                                title="Estimate monthly cost"
                                value="€ 45.60"
                                caption="month"
                                gradient="linear-gradient(135deg, #FFB300 0%, #FFCA28 100%)"
                                icon={<ShowChartIcon fontSize="small" />}
                            />
                        </Box>
                    </Box>

                    {/* Chart Section with Main Heading */}
                    <Box sx={{ mt: 4 }}>
                        <Typography 
                            variant="h4" 
                            sx={{ 
                                background: 'black',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                fontWeight: 500,
                                mb: 3,
                                fontSize: { xs: '1.5rem', md: '2rem' },
                                textAlign: 'left'
                            }}
                        >
                            Total overview of your Miner Hosted Miners
                        </Typography>
                        
                        <MiningEarningsChart 
                            title="Daily Mining Performance" 
                            height={400} 
                        />
                    </Box>
                </Container>
            </Box>

        );
    }
