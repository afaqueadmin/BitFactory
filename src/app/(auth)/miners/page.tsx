"use client";

import { Box, Typography } from "@mui/material";
import HostedMinersList from "@/components/HostedMinersList";
import HostedMinersCard from "@/components/HostedMinersCard";
import GradientStatCard from "@/components/GradientStatCard";
import EuroSymbolIcon from "@mui/icons-material/EuroSymbol";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import ShowChartIcon from "@mui/icons-material/ShowChart";

export default function Miners() {
    return (
        <Box sx={{ p: 3, mt: 2, minHeight: "100vh" }}>
            {/* Page Heading */}
            <Typography 
                variant="h3" 
                component="h1" 
                sx={{ 
                    mb: 4, 
                    fontWeight: 'bold',
                    color: 'text.primary',
                    textAlign: { xs: 'center', md: 'left' }
                }}
            >
                My Miners
            </Typography>

            {/* 4 gradient stat cards - Full width, 25% each */}
            <Box sx={{ display: 'flex', gap: 3, mb: 4, flexDirection: { xs: 'column', sm: 'row' }, flexWrap: { xs: 'nowrap', sm: 'wrap', md: 'nowrap' } }}>
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

            {/* Hosted Miners Summary Card */}
            <Box sx={{ mb: 4 }}>
                <HostedMinersCard 
                    runningCount={5}
                    progress={75}
                    errorCount={2}
                    onAddMiner={() => {
                        console.log("Add miner clicked");
                        // Add your logic here to handle adding a new miner
                    }}
                />
            </Box>

            {/* Hosted Miners List */}
            <HostedMinersList />
            
        </Box>
    );
}
