"use client";

import React from "react";
import {
    Box,
    AppBar,
    Toolbar,
    IconButton,
    useTheme,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import Image from "next/image";

export default function AdminHeader() {
    const theme = useTheme();

    return (
        <AppBar 
            position="sticky" 
            elevation={2}
            sx={{ 
                backgroundColor: theme.palette.background.paper,
                color: theme.palette.text.primary,
                borderBottom: `1px solid ${theme.palette.divider}`
            }}
        >
            <Toolbar sx={{ justifyContent: "space-between" }}>
                {/* Left Side - BitFactory Logo */}
                <Box sx={{ display: "flex", alignItems: "center" }}>
                    <Image
                        src="/BitfactoryLogo.webp"
                        alt="BitFactory Logo"
                        width={140}
                        height={40}
                        priority
                        style={{ cursor: "pointer", height: "auto" }}
                    />
                </Box>

                {/* Right Side - Settings and Account Icons */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <IconButton
                        size="large"
                        aria-label="settings"
                        color="inherit"
                        sx={{
                            "&:hover": {
                                backgroundColor: theme.palette.action.hover,
                            },
                        }}
                    >
                        <SettingsIcon />
                    </IconButton>
                    <IconButton
                        size="large"
                        aria-label="account"
                        color="inherit"
                        sx={{
                            "&:hover": {
                                backgroundColor: theme.palette.action.hover,
                            },
                        }}
                    >
                        <AccountCircleIcon />
                    </IconButton>
                </Box>
            </Toolbar>
        </AppBar>
    );
}
