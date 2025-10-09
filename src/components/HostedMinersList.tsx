"use client";

import React, { useState } from "react";
import {
    Box,
    Typography,
    Button,
    Card,
    CardContent,
    Chip,
    Stack,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    useTheme,
    alpha,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

// Types
interface MinerData {
    id: string;
    model: string;
    workerName: string;
    location: string;
    connectedPool: string;
    status: "Active" | "Inactive";
    hashRate?: string;
    temperature?: string;
    uptime?: string;
}

// Filter type
type FilterType = "ALL MINERS" | "ACTIVE" | "INACTIVE";

// Dummy data for miners
const dummyMiners: MinerData[] = [
    {
        id: "1",
        model: "Bitmain Antminer S21",
        workerName: "test567897",
        location: "UAE 2",
        connectedPool: "Default",
        status: "Active",
        hashRate: "195 TH/s",
        temperature: "72°C",
        uptime: "15d 4h 23m"
    },
    {
        id: "2",
        model: "Bitmain Antminer S21",
        workerName: "test567894",
        location: "In Transport",
        connectedPool: "Default",
        status: "Inactive",
        hashRate: "0 TH/s",
        temperature: "N/A",
        uptime: "0d 0h 0m"
    },
    {
        id: "3",
        model: "Bitmain Antminer S21 Hydro",
        workerName: "test567898",
        location: "USA 1",
        connectedPool: "Default",
        status: "Active",
        hashRate: "200 TH/s",
        temperature: "68°C",
        uptime: "22d 12h 45m"
    },
    {
        id: "4",
        model: "Bitmain Antminer S21 Pro",
        workerName: "test567895",
        location: "Repair / Warehouse",
        connectedPool: "Default",
        status: "Inactive",
        hashRate: "0 TH/s",
        temperature: "N/A",
        uptime: "0d 0h 0m"
    },
    {
        id: "5",
        model: "Bitmain Antminer S21 Pro",
        workerName: "test567896",
        location: "UAE 1",
        connectedPool: "Default",
        status: "Active",
        hashRate: "234 TH/s",
        temperature: "70°C",
        uptime: "8d 16h 12m"
    },
];

export default function HostedMinersList() {
    const theme = useTheme();
    const [activeFilter, setActiveFilter] = useState<FilterType>("ALL MINERS");

    // Filter miners based on active filter
    const filteredMiners = dummyMiners.filter(miner => {
        if (activeFilter === "ALL MINERS") return true;
        if (activeFilter === "ACTIVE") return miner.status === "Active";
        if (activeFilter === "INACTIVE") return miner.status === "Inactive";
        return true;
    });

    // Get counts for each category
    const allCount = dummyMiners.length;
    const activeCount = dummyMiners.filter(m => m.status === "Active").length;
    const inactiveCount = dummyMiners.filter(m => m.status === "Inactive").length;

    const handleFilterChange = (filter: FilterType) => {
        setActiveFilter(filter);
    };

    const getStatusChip = (status: MinerData["status"]) => {
        return (
            <Chip
                label={status}
                size="small"
                sx={{
                    backgroundColor: status === "Active" 
                        ? alpha(theme.palette.success.main, 0.1)
                        : alpha(theme.palette.error.main, 0.1),
                    color: status === "Active" 
                        ? theme.palette.success.main 
                        : theme.palette.error.main,
                    fontWeight: 500,
                    minWidth: "70px",
                }}
            />
        );
    };

    return (
        <Box sx={{ width: "100%" }}>
            {/* Header */}
            <Box sx={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                mb: 3
            }}>
                <Typography 
                    variant="h4" 
                    fontWeight="bold"
                    sx={{ color: theme.palette.text.primary }}
                >
                    All Hosted Miners
                </Typography>
                
                {/* Filter Buttons */}
                <Stack direction="row" spacing={1}>
                    <Button
                        variant={activeFilter === "ALL MINERS" ? "contained" : "outlined"}
                        onClick={() => handleFilterChange("ALL MINERS")}
                        size="small"
                        sx={{
                            minWidth: "100px",
                            textTransform: "none",
                            fontWeight: 500,
                            ...(activeFilter === "ALL MINERS" && {
                                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                                color: theme.palette.primary.main,
                                borderColor: theme.palette.primary.main,
                            }),
                        }}
                    >
                        ALL MINERS ({allCount})
                    </Button>
                    <Button
                        variant={activeFilter === "ACTIVE" ? "contained" : "contained"}
                        onClick={() => handleFilterChange("ACTIVE")}
                        size="small"
                        sx={{
                            minWidth: "80px",
                            textTransform: "none",
                            fontWeight: 500,
                            backgroundColor: activeFilter === "ACTIVE" 
                                ? theme.palette.primary.main 
                                : theme.palette.primary.main,
                            color: "white",
                            "&:hover": {
                                backgroundColor: theme.palette.primary.dark,
                            },
                        }}
                    >
                        ACTIVE ({activeCount})
                    </Button>
                    <Button
                        variant={activeFilter === "INACTIVE" ? "contained" : "contained"}
                        onClick={() => handleFilterChange("INACTIVE")}
                        size="small"
                        sx={{
                            minWidth: "80px",
                            textTransform: "none",
                            fontWeight: 500,
                            backgroundColor: activeFilter === "INACTIVE" 
                                ? theme.palette.primary.main 
                                : theme.palette.primary.main,
                            color: "white",
                            "&:hover": {
                                backgroundColor: theme.palette.primary.dark,
                            },
                        }}
                    >
                        INACTIVE ({inactiveCount})
                    </Button>
                </Stack>
            </Box>

            {/* Miners List */}
            <Box sx={{ mt: 4 }}>
                {filteredMiners.length === 0 ? (
                    <Card sx={{ p: 4, textAlign: "center" }}>
                        <Typography variant="h6" color="text.secondary">
                            No miners found for the selected filter.
                        </Typography>
                    </Card>
                ) : (
                    filteredMiners.map((miner) => (
                        <Accordion
                            key={miner.id}
                            sx={{
                                mb: 2,
                                border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
                                borderRadius: 2,
                                "&:before": {
                                    display: "none",
                                },
                                "&.Mui-expanded": {
                                    margin: "0 0 16px 0",
                                },
                            }}
                        >
                            <AccordionSummary
                                expandIcon={<ExpandMoreIcon />}
                                sx={{
                                    px: 3,
                                    py: 2,
                                    "& .MuiAccordionSummary-content": {
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                    },
                                }}
                            >
                                <Box sx={{ flex: 1 }}>
                                    <Typography 
                                        variant="h6" 
                                        fontWeight="600"
                                        sx={{ mb: 1 }}
                                    >
                                        {miner.model}
                                    </Typography>
                                    <Typography 
                                        variant="body2" 
                                        color="text.secondary"
                                        sx={{ mb: 0.5 }}
                                    >
                                        <strong>Worker Name:</strong> {miner.workerName} &nbsp;&nbsp;
                                        <strong>Location:</strong> {miner.location} &nbsp;&nbsp;
                                        <strong>Connected Pool:</strong> {miner.connectedPool}
                                    </Typography>
                                </Box>
                                
                                <Box sx={{ ml: 2 }}>
                                    {getStatusChip(miner.status)}
                                </Box>
                            </AccordionSummary>
                            
                            <AccordionDetails sx={{ px: 3, py: 2, pt: 0 }}>
                                <Box 
                                    sx={{ 
                                        backgroundColor: alpha(theme.palette.background.paper, 0.5),
                                        borderRadius: 2,
                                        p: 3,
                                        border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                                    }}
                                >
                                    <Typography variant="h6" fontWeight="600" sx={{ mb: 2 }}>
                                        Miner Details
                                    </Typography>
                                    
                                    <Stack direction="row" spacing={4} flexWrap="wrap">
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                                                Hash Rate
                                            </Typography>
                                            <Typography variant="body1" fontWeight="500">
                                                {miner.hashRate || "N/A"}
                                            </Typography>
                                        </Box>
                                        
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                                                Temperature
                                            </Typography>
                                            <Typography variant="body1" fontWeight="500">
                                                {miner.temperature || "N/A"}
                                            </Typography>
                                        </Box>
                                        
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                                                Uptime
                                            </Typography>
                                            <Typography variant="body1" fontWeight="500">
                                                {miner.uptime || "N/A"}
                                            </Typography>
                                        </Box>
                                        
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                                                Status
                                            </Typography>
                                            <Typography 
                                                variant="body1" 
                                                fontWeight="500"
                                                sx={{ 
                                                    color: miner.status === "Active" 
                                                        ? theme.palette.success.main 
                                                        : theme.palette.error.main 
                                                }}
                                            >
                                                {miner.status}
                                            </Typography>
                                        </Box>
                                    </Stack>
                                </Box>
                            </AccordionDetails>
                        </Accordion>
                    ))
                )}
            </Box>
        </Box>
    );
}