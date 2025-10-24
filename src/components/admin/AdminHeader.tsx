"use client";

import React from "react";
import {
    Box,
    AppBar,
    Toolbar,
    IconButton,
    styled,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import Image from "next/image";

const StyledAppBar = styled(AppBar)(({ theme }) => ({
    backgroundColor: theme.palette.background.paper,
    color: theme.palette.text.primary,
    borderBottom: `1px solid ${theme.palette.divider}`,
}));

const StyledIconButton = styled(IconButton)(({ theme }) => ({
    '&:hover': {
        backgroundColor: theme.palette.action.hover,
    },
}));

export default function AdminHeader() {
    return (
        <StyledAppBar 
            position="sticky" 
            elevation={2}
        >
            <Toolbar>
                {/* Left Side - BitFactory Logo */}
                <Box sx={{ display: "flex", alignItems: "center", flexGrow: 1 }}>
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
                <Box sx={{ display: "flex", gap: 1 }}>
                    <StyledIconButton
                        size="large"
                        aria-label="settings"
                        color="inherit"
                    >
                        <SettingsIcon />
                    </StyledIconButton>
                    <StyledIconButton
                        size="large"
                        aria-label="account"
                        color="inherit"
                    >
                        <AccountCircleIcon />
                    </StyledIconButton>
                </Box>
            </Toolbar>
        </StyledAppBar>
    );
}
