"use client";

import React, { useState } from "react";
import {
  Box,
  AppBar,
  Toolbar,
  IconButton,
  styled,
  Menu,
  MenuItem,
  CircularProgress,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/auth-context";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import { useTheme } from "@/app/theme-provider";

const StyledAppBar = styled(AppBar)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

const StyledIconButton = styled(IconButton)(({ theme }) => ({
  "&:hover": {
    backgroundColor: theme.palette.action.hover,
  },
}));

export default function AdminHeader() {
  const router = useRouter();
  const { logout } = useAuth();
  const [settingsAnchorEl, setSettingsAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const [accountAnchorEl, setAccountAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { darkMode, toggleDarkMode } = useTheme();

  const handleSettingsClick = (event: React.MouseEvent<HTMLElement>) => {
    setSettingsAnchorEl(event.currentTarget);
  };

  const handleAccountClick = (event: React.MouseEvent<HTMLElement>) => {
    setAccountAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setSettingsAnchorEl(null);
    setAccountAnchorEl(null);
  };

  const handleLogoClick = () => {
    router.push("/adminpanel");
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setIsLoggingOut(false);
      handleClose();
    }
  };

  return (
    <StyledAppBar position="sticky" elevation={2}>
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
            onClick={handleLogoClick}
          />
        </Box>

        {/* Right Side - Settings and Account Icons */}
        <Box sx={{ display: "flex", gap: 1 }}>
          {/* Dark Mode Toggle */}
          <StyledIconButton
            size="large"
            aria-label="darkmode"
            color="inherit"
            onClick={toggleDarkMode}
          >
            {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
          </StyledIconButton>

          <StyledIconButton
            size="large"
            aria-label="settings"
            color="inherit"
            onClick={handleSettingsClick}
          >
            <SettingsIcon />
          </StyledIconButton>
          <Menu
            anchorEl={settingsAnchorEl}
            open={Boolean(settingsAnchorEl)}
            onClose={handleClose}
          >
            <MenuItem
              onClick={() => {
                router.push("/adminpanel/settings");
                handleClose();
              }}
            >
              General Settings
            </MenuItem>
            <MenuItem
              onClick={() => {
                router.push("/adminpanel/security");
                handleClose();
              }}
            >
              Security Settings
            </MenuItem>
          </Menu>

          <StyledIconButton
            size="large"
            aria-label="account"
            color="inherit"
            onClick={handleAccountClick}
          >
            <AccountCircleIcon />
          </StyledIconButton>
          <Menu
            anchorEl={accountAnchorEl}
            open={Boolean(accountAnchorEl)}
            onClose={handleClose}
          >
            <MenuItem
              onClick={() => {
                router.push("/admin-profile");
                handleClose();
              }}
            >
              Profile
            </MenuItem>
            <MenuItem
              onClick={handleLogout}
              disabled={isLoggingOut}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              {isLoggingOut ? (
                <>
                  <CircularProgress size={16} />
                  Signing Out...
                </>
              ) : (
                "Sign Out"
              )}
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </StyledAppBar>
  );
}
