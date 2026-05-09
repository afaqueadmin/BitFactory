"use client";

import React, { useState } from "react";
import {
  AppBar,
  Drawer,
  Divider,
  Toolbar,
  IconButton,
  Menu,
  MenuItem,
  Box,
  Button,
  Stack,
  CircularProgress,
  Badge,
  List,
  ListItemButton,
  ListItemText,
  useMediaQuery,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useAuth } from "@/lib/contexts/auth-context";
// import SettingsIcon from "@mui/icons-material/Settings";
import AccountCircle from "@mui/icons-material/AccountCircle";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { useTheme } from "@/app/theme-provider";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/lib/hooks/useUser";
import { Invoice } from "@prisma/client";

export default function AppBarComponent() {
  const { darkMode, toggleDarkMode } = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { logout } = useAuth();
  const pathname = usePathname(); // Get current path
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("md"));
  const isLarge = useMediaQuery((theme) => theme.breakpoints.up("lg"));

  const { user } = useUser();

  const { data: invoicesData } = useQuery<{ invoices: Invoice[] }>({
    queryKey: ["invoices-unread", user?.id],
    queryFn: async () => {
      if (!user?.id) return { invoices: [] };
      const res = await fetch(
        `/api/accounting/invoices?customerId=${user.id}`,
        {
          method: "GET",
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  const unpaidCount =
    invoicesData?.invoices?.filter((inv: Invoice) => inv.status !== "PAID")
      .length || 0;

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleOpenMobileNav = () => {
    setMobileNavOpen(true);
  };

  const handleCloseMobileNav = () => {
    setMobileNavOpen(false);
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

  const trackTab = (href: string, label: string) => {
    const tabKey = href.replace(/^\//, "") || "dashboard";
    fetch("/api/activity/tab-visit", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabKey, tabName: label }),
    }).catch(() => {});
  };

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/miners", label: "Miners" },
    { href: "/wallet", label: "Wallet" },
    { href: "/transaction", label: "Transactions" },
    { href: "/invoices", label: "Invoices" },
    { href: "/btc-price-history", label: "BTC Price" },
    { href: "/btc-price-predictor", label: "BTC Predictor" },
    { href: "/hashprice-history", label: "Hashprice" },
    { href: "/payback-analysis", label: "Payback Analysis" },
  ];

  // Determine how many links to show inline before collapsing into "More".
  // On large screens show all; on medium show a limited number.
  const visibleCount = isLarge ? navLinks.length : 5;
  const visibleLinks = navLinks.slice(0, visibleCount);
  const overflowLinks = navLinks.slice(visibleCount);
  const [moreAnchorEl, setMoreAnchorEl] = useState<null | HTMLElement>(null);
  const handleMoreOpen = (e: React.MouseEvent<HTMLElement>) =>
    setMoreAnchorEl(e.currentTarget);
  const handleMoreClose = () => setMoreAnchorEl(null);

  const linkButtonSx = (href: string) => ({
    color: darkMode ? "white" : "black",
    textTransform: "none",
    fontWeight: 500,
    px: 2,
    position: "relative" as const,
    "&:hover": {
      backgroundColor: darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
    },
    "&::after": {
      content: '""',
      position: "absolute" as const,
      bottom: 0,
      left: 8,
      right: 8,
      height: 2,
      backgroundColor: "primary.main",
      transform: pathname === href ? "scaleX(1)" : "scaleX(0)",
      transition: "transform 0.2s ease-in-out",
    },
  });

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
      <Toolbar
        sx={{
          minHeight: { xs: 64, sm: 68 },
          pl: { xs: 1, sm: 1.5, md: 3 },
          pr: { xs: 1.5, sm: 2, md: 6 },
          scrollbarGutter: "stable",
          gap: { xs: 0.5, sm: 1, md: 2 },
        }}
      >
        {/* Logo */}
        <Box
          sx={{
            mr: { xs: 0.5, sm: 1, md: 4 },
            pl: { xs: 0, md: 5 },
            flexShrink: 0,
          }}
        >
          <Link href="/dashboard">
            <Image
              src="/BitfactoryLogo.webp"
              alt="BitFactory Logo"
              width={isMobile ? 150 : 160}
              height={isMobile ? 44 : 46}
              priority
              style={{ cursor: "pointer", height: "auto" }}
            />
          </Link>
        </Box>

        {/* Navigation Links - Desktop */}
        <Box
          sx={{
            flexGrow: 1,
            display: { xs: "none", md: "flex" },
            justifyContent: "left",
            pl: 5,
          }}
        >
          <Stack
            direction="row"
            spacing={3}
            sx={{ flexWrap: "nowrap", alignItems: "center" }}
          >
            {visibleLinks.map((link) => (
              <Button
                key={link.href}
                component={Link}
                href={link.href}
                sx={linkButtonSx(link.href)}
                onClick={() => trackTab(link.href, link.label)}
              >
                {link.href === "/invoices" ? (
                  <Badge
                    color="error"
                    badgeContent={unpaidCount}
                    invisible={unpaidCount === 0}
                    anchorOrigin={{ vertical: "top", horizontal: "right" }}
                    sx={{
                      "& .MuiBadge-badge": {
                        fontSize: "0.65rem",
                        minWidth: 16,
                        height: 16,
                        padding: "0 4px",
                        borderRadius: 8,
                        transform: "translate(12px, -7px)",
                      },
                    }}
                  >
                    <span>{link.label}</span>
                  </Badge>
                ) : (
                  link.label
                )}
              </Button>
            ))}

            {overflowLinks.length > 0 && (
              <>
                <IconButton
                  aria-label="more"
                  onClick={handleMoreOpen}
                  sx={{ color: darkMode ? "white" : "black" }}
                >
                  <MoreVertIcon />
                </IconButton>
                <Menu
                  anchorEl={moreAnchorEl}
                  open={Boolean(moreAnchorEl)}
                  onClose={handleMoreClose}
                >
                  {overflowLinks.map((link) => (
                    <MenuItem
                      key={link.href}
                      component={Link}
                      href={link.href}
                      onClick={() => {
                        trackTab(link.href, link.label);
                        handleMoreClose();
                      }}
                    >
                      {link.label}
                    </MenuItem>
                  ))}
                </Menu>
              </>
            )}
          </Stack>
        </Box>

        {/* Navigation toggle - Mobile */}
        <Box
          sx={{
            display: { xs: "flex", md: "none" },
            flexGrow: 1,
            justifyContent: "flex-end",
          }}
        >
          <IconButton
            onClick={handleOpenMobileNav}
            sx={{ color: darkMode ? "white" : "black" }}
            aria-label="Open navigation menu"
          >
            <Box
              component="span"
              sx={{
                width: 24,
                height: 2,
                bgcolor: "currentColor",
                position: "relative",
                display: "block",
                borderRadius: 1,
                "&::before, &::after": {
                  content: '""',
                  position: "absolute",
                  left: 0,
                  width: 24,
                  height: 2,
                  bgcolor: "currentColor",
                  borderRadius: 1,
                },
                "&::before": { top: -7 },
                "&::after": { top: 7 },
              }}
            />
          </IconButton>
        </Box>

        {/* Dark Mode Toggle */}
        <IconButton
          onClick={toggleDarkMode}
          sx={{ color: darkMode ? "white" : "black", ml: { xs: 0, md: 1 } }}
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
          sx={{
            color: darkMode ? "white" : "black",
            mr: { xs: 1, md: 2 },
            position: "relative",
          }}
        >
          <AccountCircle />
        </IconButton>

        {/* Spacer to keep icons clear of overlay scrollbars */}
        <Box sx={{ width: { xs: 8, sm: 12, md: 20 }, flexShrink: 0 }} />
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

      <Drawer
        anchor="left"
        open={mobileNavOpen}
        onClose={handleCloseMobileNav}
        PaperProps={{
          sx: {
            width: "100%",
            maxWidth: 280,
            backgroundColor: darkMode ? "grey.900" : "white",
            color: darkMode ? "white" : "black",
          },
        }}
      >
        <Box sx={{ px: 2, pt: 1, pb: 1 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Box>
              <Link href="/dashboard" onClick={handleCloseMobileNav}>
                <Image
                  src="/BitfactoryLogo.webp"
                  alt="BitFactory Logo"
                  width={120}
                  height={34}
                  priority
                  style={{ cursor: "pointer", height: "auto" }}
                />
              </Link>
            </Box>
            <IconButton
              onClick={handleCloseMobileNav}
              sx={{ color: darkMode ? "white" : "black" }}
              aria-label="Close navigation menu"
            >
              <span style={{ fontSize: 24, lineHeight: 1 }}>×</span>
            </IconButton>
          </Stack>
        </Box>
        <Divider />
        <List>
          {navLinks.map((link) => (
            <ListItemButton
              key={link.href}
              component={Link}
              href={link.href}
              onClick={() => {
                trackTab(link.href, link.label);
                handleCloseMobileNav();
              }}
              selected={pathname === link.href}
              sx={{ px: 2 }}
            >
              {link.href === "/invoices" ? (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <ListItemText
                    primary={link.label}
                    primaryTypographyProps={{ fontWeight: 500 }}
                  />
                  {unpaidCount > 0 && (
                    <Badge
                      color="error"
                      badgeContent={unpaidCount}
                      sx={{
                        "& .MuiBadge-badge": {
                          fontSize: "0.7rem",
                          minWidth: 18,
                          height: 18,
                          padding: "0 4px",
                          borderRadius: 9,
                        },
                      }}
                    />
                  )}
                </Box>
              ) : (
                <ListItemText
                  primary={link.label}
                  primaryTypographyProps={{ fontWeight: 500 }}
                />
              )}
            </ListItemButton>
          ))}
        </List>
      </Drawer>
    </AppBar>
  );
}
