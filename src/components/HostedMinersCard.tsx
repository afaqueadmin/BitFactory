// src/components/HostedMinersCard.tsx
"use client";

/**
 * HostedMinersCard
 *
 * Props:
 * - runningCount: number (how many running)
 * - progress: number (0-100)
 * - errorCount: number
 * - onAddMiner: () => void
 *
 * Visual details:
 * - Title + icon top-left
 * - subtitle small
 * - long rounded progress bar
 * - Errors chip bottom-left (red)
 * - ADD MINER button bottom-right
 *
 * Accessibility:
 * - Button has aria-label
 */

import React, { useState } from "react";
import {
    Box,
    Card,
    CardContent,
    Typography,
    LinearProgress,
    Chip,
    Button,
    useTheme,
    Stack,
    SvgIcon,
} from "@mui/material";
import StorageIcon from "@mui/icons-material/Storage";
import AddMinerModal from "./AddMinerModal";

export interface HostedMinersCardProps {
    runningCount: number;
    progress: number; // 0..100
    errorCount: number;
    onAddMiner?: () => void;
}

export default function HostedMinersCard({
                                             runningCount,
                                             progress,
                                             errorCount,
                                             onAddMiner,
                                         }: HostedMinersCardProps) {
    const theme = useTheme();
    const [isModalOpen, setIsModalOpen] = useState(false);

    // progress color uses success/main or custom green
    const progressSx = {
        height: 10,
        borderRadius: 5,
        // custom bar color
        "& .MuiLinearProgress-bar": {
            borderRadius: 5,
            backgroundColor: "#00C853", // green as requested
        },
        backgroundColor:
            theme.palette.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    };

    return (
        <Card
            sx={{
                borderRadius: 2,
                boxShadow: "0px 6px 18px rgba(2,6,23,0.06)",
                height: "100%",
                display: "flex",
                flexDirection: "column",
            }}
            role="region"
            aria-label="Hosted Miners"
        >
            <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                {/* Top: icon + title */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <SvgIcon
                        component={StorageIcon}
                        sx={{
                            fontSize: 28,
                            color: "primary.main",
                        }}
                        aria-hidden
                    />
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Hosted Miners
                    </Typography>
                </Box>

                {/* Subtitle */}
                <Typography variant="body2" color="text.secondary">
                    {runningCount} running
                </Typography>

                {/* Long progress bar */}
                <Box sx={{ width: "100%", mt: 1 }}>
                    <LinearProgress
                        variant="determinate"
                        value={Math.max(0, Math.min(100, progress))}
                        sx={progressSx}
                        aria-valuenow={progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        role="progressbar"
                    />
                </Box>

                {/* Spacer to push controls to bottom */}
                <Box sx={{ flex: 1 }} />

                {/* Bottom row: error chip left, add button right */}
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 2,
                        mt: 1,
                    }}
                >
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                            label={`Errors: ${errorCount}`}
                            color={errorCount > 0 ? "error" : "default"}
                            variant={errorCount > 0 ? "filled" : "outlined"}
                            sx={{ fontWeight: 600 }}
                            aria-live="polite"
                        />
                    </Stack>

                    <Button
                        variant="contained"
                        color="primary"
                        onClick={() => {
                            setIsModalOpen(true);
                            if (onAddMiner) onAddMiner();
                        }}
                        aria-label="Add miner"
                        sx={{
                            borderRadius: 8,
                            px: 2.5,
                            py: 1,
                            textTransform: "uppercase",
                            boxShadow: "0px 6px 12px rgba(0,0,0,0.08)",
                            fontWeight: 700,
                        }}
                    >
                        ADD MINER
                    </Button>
                </Box>
            </CardContent>

            {/* Add Miner Modal */}
            <AddMinerModal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </Card>
    );
}
