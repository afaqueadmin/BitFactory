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
  Badge,
} from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/auth-context";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import { useTheme } from "@/app/theme-provider";
import { useTickets } from "@/lib/hooks";

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

export default function FranchiseHeader() {
  const router = useRouter();
  const { logout } = useAuth();
  const [accountAnchorEl, setAccountAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { darkMode, toggleDarkMode } = useTheme();
  const { tickets: openTickets } = useTickets({ status: "OPEN" });
  const openTicketCount = openTickets.length;

  const handleAccountClick = (event: React.MouseEvent<HTMLElement>) => {
    setAccountAnchorEl(event.currentTarget);
  };

  const handleClose = () => setAccountAnchorEl(null);

  const handleLogoClick = () => router.push("/franchise/dashboard");

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
        <Box sx={{ display: "flex", alignItems: "center", flexGrow: 1 }}>
          <Image
            src="/BitfactoryLogo.webp"
            alt="BitFactory Logo"
            width={162}
            height={46}
            priority
            style={{ cursor: "pointer", height: "auto" }}
            onClick={handleLogoClick}
          />
        </Box>

        <Box sx={{ display: "flex", gap: 1 }}>
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
            aria-label="account"
            color="inherit"
            onClick={handleAccountClick}
          >
            <Badge
              color="error"
              badgeContent={openTicketCount}
              invisible={openTicketCount === 0}
              max={99}
              anchorOrigin={{ vertical: "top", horizontal: "right" }}
              sx={{
                "& .MuiBadge-badge": {
                  fontSize: "0.65rem",
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                  borderRadius: 8,
                },
              }}
            >
              <AccountCircleIcon />
            </Badge>
          </StyledIconButton>
          <Menu
            anchorEl={accountAnchorEl}
            open={Boolean(accountAnchorEl)}
            onClose={handleClose}
          >
            <MenuItem
              onClick={() => {
                router.push("/account-settings");
                handleClose();
              }}
            >
              Account Settings
            </MenuItem>
            <MenuItem
              onClick={() => {
                router.push("/security-setting");
                handleClose();
              }}
            >
              Security Settings
            </MenuItem>
            <MenuItem
              onClick={() => {
                router.push("/franchise/support");
                handleClose();
              }}
              sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}
            >
              Support
              {openTicketCount > 0 && (
                <Badge
                  color="error"
                  badgeContent={openTicketCount}
                  max={99}
                  sx={{
                    "& .MuiBadge-badge": {
                      position: "static",
                      transform: "none",
                      fontSize: "0.65rem",
                      minWidth: 16,
                      height: 16,
                      padding: "0 4px",
                      borderRadius: 8,
                    },
                  }}
                />
              )}
            </MenuItem>
            <MenuItem
              onClick={handleLogout}
              disabled={isLoggingOut}
              sx={{ display: "flex", alignItems: "center", gap: 1 }}
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
