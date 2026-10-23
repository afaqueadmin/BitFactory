"use client";

import React, { useState } from "react";
import {
  Box,
  AppBar,
  Toolbar,
  IconButton,
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
import {
  HEADER_HEIGHT,
  MQ,
  focusRing,
  logoFilter,
  useDaylight,
} from "@/lib/daylight";

export default function AdminHeader() {
  const router = useRouter();
  const { logout } = useAuth();
  const { toggleMobileOpen } = useAdminNav();
  const [accountAnchorEl, setAccountAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { darkMode, toggleDarkMode } = useTheme();
  const { d, fonts } = useDaylight();

  const iconBtnSx = {
    width: 40,
    height: 40,
    border: `1px solid ${d.border}`,
    bgcolor: d.surface,
    borderRadius: "10px",
    color: d.muted,
    "&:hover": { bgcolor: d.hover },
    "&:focus-visible": focusRing(d.action),
    "& .MuiSvgIcon-root": { fontSize: 20 },
    [MQ.mobile]: { width: 44, height: 44 },
  } as const;

  const menuPaperSx = {
    mt: 1,
    minWidth: 200,
    borderRadius: "12px",
    border: `1px solid ${d.border}`,
    bgcolor: d.surface,
    backgroundImage: "none",
    boxShadow: "0 8px 30px rgba(100,114,124,.13)",
    fontFamily: fonts.body,
    "& .MuiMenuItem-root": {
      minHeight: 44,
      px: 2,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: 500,
      color: d.text,
      "&:hover": { bgcolor: d.hover },
      "&.Mui-focusVisible": { bgcolor: d.skySoft },
    },
  } as const;

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
    <AppBar
      // Static: the layout shell keeps it on screen (only <main> scrolls).
      position="static"
      elevation={0}
      sx={{
        flexShrink: 0,
        backgroundColor: d.surface,
        backgroundImage: "none",
        color: d.text,
        borderBottom: `1px solid ${d.border}`,
        boxShadow: "none",
        fontFamily: fonts.body,
      }}
    >
      <Toolbar
        disableGutters
        sx={{
          px: { xs: "16px", sm: "24px", md: "36px" },
          height: HEADER_HEIGHT.desktop,
          minHeight: HEADER_HEIGHT.desktop,
          [MQ.mobile]: {
            height: HEADER_HEIGHT.mobile,
            minHeight: HEADER_HEIGHT.mobile,
          },
        }}
      >
        {/* Mobile Hamburger Menu Toggle */}
        <IconButton
          color="inherit"
          aria-label="open drawer"
          edge="start"
          onClick={toggleMobileOpen}
          sx={{
            ...iconBtnSx,
            ml: 0,
            mr: { xs: 1.5, sm: 2 },
            display: { xs: "flex", md: "none" },
          }}
        >
          <MenuIcon />
        </IconButton>

        {/* Left Side - BitFactory Logo */}
        <Box sx={{ display: "flex", alignItems: "center", flexGrow: 1 }}>
          <Box
            sx={{
              position: "relative",
              width: { xs: 150, sm: 190, md: 210 },
              height: { xs: 44, sm: 52, md: 58 },
              cursor: "pointer",
            }}
            onClick={handleLogoClick}
          >
            <Image
              src="/BitfactoryLogo.webp"
              alt="BitFactory Logo"
              fill
              sizes="(max-width: 600px) 150px, 210px"
              priority
              style={{
                objectFit: "contain",
                objectPosition: "left center",
                filter: logoFilter(darkMode),
              }}
            />
          </Box>
        </Box>

        {/* Right Side - BTC Ticker, Settings and Account Icons */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: "8px", sm: "10px" },
          }}
        >
          {/* Live BTC Price Ticker */}
          <Box sx={{ display: { xs: "none", sm: "flex" }, mr: 0.5 }}>
            <BtcPriceLabel daylight />
          </Box>

          {/* Dark Mode Toggle */}
          <IconButton
            aria-label="darkmode"
            onClick={toggleDarkMode}
            sx={iconBtnSx}
          >
            {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>

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

          <IconButton
            aria-label="account"
            onClick={handleAccountClick}
            sx={{ ...iconBtnSx, color: d.action }}
          >
            <AccountCircleIcon />
          </IconButton>
          <Menu
            anchorEl={accountAnchorEl}
            open={Boolean(accountAnchorEl)}
            onClose={handleClose}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            slotProps={{ paper: { sx: menuPaperSx } }}
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
                  <CircularProgress size={16} sx={{ color: d.action }} />
                  Signing Out...
                </>
              ) : (
                "Sign Out"
              )}
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
