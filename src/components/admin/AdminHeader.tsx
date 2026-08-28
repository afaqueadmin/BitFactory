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
import MenuIcon from "@mui/icons-material/Menu";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/auth-context";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import { useTheme } from "@/app/theme-provider";
import BtcPriceLabel from "@/components/BtcPriceLabel";
import { useAdminNav } from "@/lib/contexts/admin-nav-context";

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
  const { toggleMobileOpen } = useAdminNav();
  const [accountAnchorEl, setAccountAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { darkMode, toggleDarkMode } = useTheme();

  const handleAccountClick = (event: React.MouseEvent<HTMLElement>) => {
    setAccountAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
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
      <Toolbar
        sx={{
          px: { xs: 1.5, sm: 2.5, md: 3.5 },
          minHeight: { xs: 64, sm: 70, md: 74 },
          py: 0.5,
        }}
      >
        {/* Mobile Hamburger Menu Toggle */}
        <IconButton
          color="inherit"
          aria-label="open drawer"
          edge="start"
          onClick={toggleMobileOpen}
          sx={{
            mr: { xs: 0.75, sm: 1.5 },
            display: { xs: "flex", md: "none" },
          }}
        >
          <MenuIcon sx={{ fontSize: { xs: 26, sm: 28 } }} />
        </IconButton>

        {/* Left Side - BitFactory Logo */}
        <Box sx={{ display: "flex", alignItems: "center", flexGrow: 1 }}>
          <Box
            sx={{
              position: "relative",
              width: { xs: 190, sm: 230, md: 260 },
              height: { xs: 50, sm: 58, md: 66 },
              cursor: "pointer",
            }}
            onClick={handleLogoClick}
          >
            <Image
              src="/BitfactoryLogo.webp"
              alt="BitFactory Logo"
              fill
              sizes="(max-width: 600px) 190px, 260px"
              priority
              style={{ objectFit: "contain", objectPosition: "left center" }}
            />
          </Box>
        </Box>

        {/* Right Side - BTC Ticker, Settings and Account Icons */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: 0.5, sm: 1 },
          }}
        >
          {/* Live BTC Price Ticker */}
          <Box sx={{ display: { xs: "none", sm: "flex" }, mr: 0.5 }}>
            <BtcPriceLabel />
          </Box>

          {/* Dark Mode Toggle */}
          <StyledIconButton
            size="large"
            aria-label="darkmode"
            color="inherit"
            onClick={toggleDarkMode}
          >
            {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
          </StyledIconButton>

          {/*<StyledIconButton*/}
          {/*  size="large"*/}
          {/*  aria-label="settings"*/}
          {/*  color="inherit"*/}
          {/*  onClick={handleSettingsClick}*/}
          {/*>*/}
          {/*  <SettingsIcon />*/}
          {/*</StyledIconButton>*/}
          {/*<Menu*/}
          {/*  anchorEl={settingsAnchorEl}*/}
          {/*  open={Boolean(settingsAnchorEl)}*/}
          {/*  onClose={handleClose}*/}
          {/*>*/}
          {/*  <MenuItem*/}
          {/*    onClick={() => {*/}
          {/*      router.push("/adminpanel/settings");*/}
          {/*      handleClose();*/}
          {/*    }}*/}
          {/*  >*/}
          {/*    General Settings*/}
          {/*  </MenuItem>*/}
          {/*  <MenuItem*/}
          {/*    onClick={() => {*/}
          {/*      router.push("/adminpanel/security");*/}
          {/*      handleClose();*/}
          {/*    }}*/}
          {/*  >*/}
          {/*    Security Settings*/}
          {/*  </MenuItem>*/}
          {/*</Menu>*/}

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
              Account Settings
            </MenuItem>
            <MenuItem
              onClick={() => {
                router.push("/security-settings");
                handleClose();
              }}
            >
              Security Settings
            </MenuItem>

            <MenuItem
              onClick={() => {
                router.push("/settings/payment");
                handleClose();
              }}
            >
              Payment Settings
            </MenuItem>

            <MenuItem
              onClick={() => {
                router.push("/external-resource");
                handleClose();
              }}
            >
              External Resource
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
