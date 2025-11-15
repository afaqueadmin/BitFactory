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
  Button,
  useTheme,
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
      <CardContent
        sx={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}
      >
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
            My Factory Status
          </Typography>
        </Box>

        {/* Header with running count and error count */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontWeight: 600 }}
          >
            {runningCount} running
          </Typography>
          <Typography variant="body2" color="error" sx={{ fontWeight: 600 }}>
            {errorCount} error{errorCount !== 1 ? "s" : ""}
          </Typography>
        </Box>

        {/* Split progress bar - green for running, red for errors */}
        <Box sx={{ width: "100%", mt: 1 }}>
          <Box
            sx={{
              display: "flex",
              height: 10,
              borderRadius: 5,
              overflow: "hidden",
              backgroundColor:
                theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.06)",
            }}
          >
            {/* Green section for running miners */}
            <Box
              sx={{
                flex: runningCount,
                backgroundColor: "#00C853",
                height: "100%",
              }}
              role="progressbar"
              aria-valuenow={runningCount}
              aria-label={`${runningCount} miners running`}
            />
            {/* Red section for errors */}
            {errorCount > 0 && (
              <Box
                sx={{
                  flex: errorCount,
                  backgroundColor: "#FF5252",
                  height: "100%",
                }}
                role="progressbar"
                aria-valuenow={errorCount}
                aria-label={`${errorCount} errors`}
              />
            )}
          </Box>
        </Box>

        {/* Spacer to push controls to bottom */}
        <Box sx={{ flex: 1 }} />

        {/* Bottom row: add button right */}
        {/* hidden for now will be removed soon based on decision */}
        {/* <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 2,
                        mt: 1,
                    }}
                >
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
                </Box> */}
      </CardContent>

      {/* Add Miner Modal */}
      <AddMinerModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </Card>
  );
}
