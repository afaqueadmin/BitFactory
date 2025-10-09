"use client";

import { Box } from "@mui/material";
import HostedMinersList from "@/components/HostedMinersList";

export default function Miners() {
    return (
        <Box sx={{ p: 5, mt: 2, minHeight: "100vh" }}>
            <HostedMinersList />
        </Box>
    );
}
