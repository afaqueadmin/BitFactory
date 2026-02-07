"use client";

import React, { useState } from "react";
import {
  AppBar,
  Toolbar,
  IconButton,
  Menu,
  MenuItem,
  Box,
  Button,
  Stack,
  CircularProgress,
} from "@mui/material";
import { useAuth } from "@/lib/contexts/auth-context";
// import SettingsIcon from "@mui/icons-material/Settings";
import AccountCircle from "@mui/icons-material/AccountCircle";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { useTheme } from "@/app/theme-provider";

export default function AppBarComponent() {
  const { darkMode, toggleDarkMode } = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { logout } = useAuth();
  const pathname = usePathname(); // Get current path

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
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
      position="fixed"
      sx={{
        zIndex: 1201,
        backgroundColor: darkMode ? "grey.900" : "white",
        color: darkMode ? "white" : "black",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      }}
    >
      <Toolbar>
        {/* Logo */}
        <Box sx={{ mr: 4, pl: 5 }}>
          <Link href="/dashboard">
            <Image
              src="/BitfactoryLogo.webp"
              alt="BitFactory Logo"
              width={140}
              height={40}
              priority
              style={{ cursor: "pointer", height: "auto" }}
            />
          </Link>
        </Box>

        {/* Navigation Links - Centered */}
        <Box
          sx={{ flexGrow: 1, display: "flex", justifyContent: "left", pl: 5 }}
        >
          <Stack direction="row" spacing={3}>
            <Button
              component={Link}
              href="/dashboard"
              sx={{
                color: darkMode ? "white" : "black",
                textTransform: "none",
                fontWeight: 500,
                px: 2,
                position: "relative",
                "&:hover": {
                  backgroundColor: darkMode
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.1)",
                },
                "&::after": {
                  content: '""',
                  position: "absolute",
                  bottom: 0,
                  left: 8,
                  right: 8,
                  height: 2,
                  backgroundColor: "primary.main",
                  transform:
                    pathname === "/dashboard" ? "scaleX(1)" : "scaleX(0)",
                  transition: "transform 0.2s ease-in-out",
                },
              }}
            >
              Dashboard
            </Button>
            <Button
              component={Link}
              href="/miners"
              sx={{
                color: darkMode ? "white" : "black",
                textTransform: "none",
                fontWeight: 500,
                px: 2,
                position: "relative",
                "&:hover": {
                  backgroundColor: darkMode
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.1)",
                },
                "&::after": {
                  content: '""',
                  position: "absolute",
                  bottom: 0,
                  left: 8,
                  right: 8,
                  height: 2,
                  backgroundColor: "primary.main",
                  transform: pathname === "/miners" ? "scaleX(1)" : "scaleX(0)",
                  transition: "transform 0.2s ease-in-out",
                },
              }}
            >
              Miners
            </Button>
            <Button
              component={Link}
              href="/wallet"
              sx={{
                color: darkMode ? "white" : "black",
                textTransform: "none",
                fontWeight: 500,
                px: 2,
                position: "relative",
                "&:hover": {
                  backgroundColor: darkMode
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.1)",
                },
                "&::after": {
                  content: '""',
                  position: "absolute",
                  bottom: 0,
                  left: 8,
                  right: 8,
                  height: 2,
                  backgroundColor: "primary.main",
                  transform: pathname === "/wallet" ? "scaleX(1)" : "scaleX(0)",
                  transition: "transform 0.2s ease-in-out",
                },
              }}
            >
              Wallet
            </Button>
            <Button
              component={Link}
              href="/invoices"
              sx={{
                color: darkMode ? "white" : "black",
                textTransform: "none",
                fontWeight: 500,
                px: 2,
                position: "relative",
                "&:hover": {
                  backgroundColor: darkMode
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.1)",
                },
                "&::after": {
                  content: '""',
                  position: "absolute",
                  bottom: 0,
                  left: 8,
                  right: 8,
                  height: 2,
                  backgroundColor: "primary.main",
                  transform: pathname === "/invoices" ? "scaleX(1)" : "scaleX(0)",
                  transition: "transform 0.2s ease-in-out",
                },
              }}
            >
              Invoices
            </Button>
            <Button
              component={Link}
              href="/btc-price-history"
              sx={{
                color: darkMode ? "white" : "black",
                textTransform: "none",
                fontWeight: 500,
                px: 2,
                position: "relative",
                "&:hover": {
                  backgroundColor: darkMode
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.1)",
                },
                "&::after": {
                  content: '""',
                  position: "absolute",
                  bottom: 0,
                  left: 8,
                  right: 8,
                  height: 2,
                  backgroundColor: "primary.main",
                  transform: pathname === "/btc-price-history" ? "scaleX(1)" : "scaleX(0)",
                  transition: "transform 0.2s ease-in-out",
                },
              }}
            >
              BTC Price
            </Button>
            <Button
              component={Link}
              href="/hashprice-history"
              sx={{
                color: darkMode ? "white" : "black",
                textTransform: "none",
                fontWeight: 500,
                px: 2,
                position: "relative",
                "&:hover": {
                  backgroundColor: darkMode
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.1)",
                },
                "&::after": {
                  content: '""',
                  position: "absolute",
                  bottom: 0,
                  left: 8,
                  right: 8,
                  height: 2,
                  backgroundColor: "primary.main",
                  transform: pathname === "/hashprice-history" ? "scaleX(1)" : "scaleX(0)",
                  transition: "transform 0.2s ease-in-out",
                },
              }}
            >
              Hashprice
            </Button>
          </Stack>
        </Box>

        {/* Dark Mode Toggle */}
        <IconButton
          onClick={toggleDarkMode}
          sx={{ color: darkMode ? "white" : "black" }}
        >
          {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
        </IconButton>

        {/* Settings */}
        {/*<IconButton*/}
        {/*  component={Link}*/}
        {/*  href="/settings"*/}
        {/*  sx={{ color: darkMode ? "white" : "black" }}*/}
        {/*>*/}
        {/*  <SettingsIcon />*/}
        {/*</IconButton>*/}

        {/* Account Menu */}
        <IconButton
          onClick={handleMenu}
          sx={{ color: darkMode ? "white" : "black" }}
        >
          <AccountCircle />
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
        >
          {/*<MenuItem component={Link} href="/profile" onClick={handleClose}>*/}
          {/*  Profile*/}
          {/*</MenuItem>*/}
          <MenuItem
            component={Link}
            href="/account-settings"
            onClick={handleClose}
          >
            Account Settings
          </MenuItem>
          <MenuItem
            component={Link}
            href="/security-setting"
            onClick={handleClose}
          >
            Security Settings
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
      </Toolbar>
    </AppBar>
  );
}
