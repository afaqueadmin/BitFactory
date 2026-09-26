"use client";

/**
 * Client navigation - BitFactory Daylight theme (v1.3).
 *
 * - >= 700px: fixed left sidebar (brand, user card, grouped navigation, help
 *   card) plus a slim 76px top bar (breadcrumb, theme toggle, account menu).
 *   The page is shifted right with a body padding so every page that renders
 *   this component keeps its own layout untouched.
 * - < 700px: 72px mobile top bar plus bottom navigation; the "Menu" tab opens
 *   the full navigation drawer.
 */

import React, { useState } from "react";
import {
  AppBar,
  ButtonBase,
  Drawer,
  Toolbar,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Box,
  CircularProgress,
  GlobalStyles,
} from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import AccountCircle from "@mui/icons-material/AccountCircle";
import CheckIcon from "@mui/icons-material/Check";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import DarkModeIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeIcon from "@mui/icons-material/LightModeOutlined";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import MemoryOutlinedIcon from "@mui/icons-material/MemoryOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import CurrencyBitcoinIcon from "@mui/icons-material/CurrencyBitcoin";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import { useAuth } from "@/lib/contexts/auth-context";
import { useSubaccountFilter } from "@/lib/contexts/subaccountFilter-context";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { useTheme } from "@/app/theme-provider";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/lib/hooks/useUser";
import { Invoice } from "@prisma/client";
import {
  HEADER_HEIGHT,
  MQ,
  focusRing,
  sidebarWidthStyles,
  useDaylight,
} from "@/lib/daylight";

/** Height of the mobile bottom navigation (guide §7 / preview). */
const BOTTOM_NAV_HEIGHT = 72;
const SAFE_BOTTOM = "env(safe-area-inset-bottom, 0px)";

interface NavLink {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const getInitials = (name?: string | null) => {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
};

// Sidebar groups (preview: "Menu" and "Tools" sections).
const mainLinks: NavLink[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <SpaceDashboardOutlinedIcon />,
  },
  { href: "/miners", label: "Miners", icon: <MemoryOutlinedIcon /> },
  {
    href: "/wallet",
    label: "Wallet",
    icon: <AccountBalanceWalletOutlinedIcon />,
  },
  {
    href: "/transaction",
    label: "Transactions",
    icon: <SwapHorizOutlinedIcon />,
  },
  { href: "/invoices", label: "Invoices", icon: <ReceiptLongOutlinedIcon /> },
];

const toolLinks: NavLink[] = [
  {
    href: "/btc-price-history",
    label: "BTC Price",
    icon: <CurrencyBitcoinIcon />,
  },
  {
    href: "/btc-price-predictor",
    label: "BTC Predictor",
    icon: <InsightsOutlinedIcon />,
  },
  {
    href: "/hashprice-history",
    label: "Hashprice",
    icon: <ShowChartOutlinedIcon />,
  },
  {
    href: "/payback-analysis",
    label: "Payback Analysis",
    icon: <SavingsOutlinedIcon />,
  },
];

const allLinks = [...mainLinks, ...toolLinks];

// Primary destinations for the mobile bottom navigation; everything else is
// reachable through the "Menu" tab, which opens the full drawer.
const mobileTabs = mainLinks.filter((l) =>
  ["/dashboard", "/miners", "/wallet", "/invoices"].includes(l.href),
);

export default function AppBarComponent() {
  const { darkMode, toggleDarkMode } = useTheme();
  const { d, fonts } = useDaylight();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [subaccountAnchorEl, setSubaccountAnchorEl] =
    useState<null | HTMLElement>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { logout } = useAuth();
  const {
    available: availableSubaccounts,
    selected: selectedSubaccounts,
    setSelected: setSelectedSubaccounts,
  } = useSubaccountFilter();
  const pathname = usePathname(); // Get current path

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

  const handleSubaccountMenu = (event: React.MouseEvent<HTMLElement>) => {
    setSubaccountAnchorEl(event.currentTarget);
  };

  const handleSubaccountMenuClose = () => {
    setSubaccountAnchorEl(null);
  };

  const toggleSubaccount = (authKey: string) => {
    if (selectedSubaccounts === "all") {
      setSelectedSubaccounts([authKey]);
      return;
    }
    const isSelected = selectedSubaccounts.includes(authKey);
    if (isSelected && selectedSubaccounts.length === 1) return; // keep at least one selected
    const next = isSelected
      ? selectedSubaccounts.filter((k) => k !== authKey)
      : [...selectedSubaccounts, authKey];
    setSelectedSubaccounts(
      next.length === availableSubaccounts.length ? "all" : next,
    );
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

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(`${href}/`);

  const currentLabel =
    allLinks.find((l) => isActive(l.href))?.label ?? "Dashboard";

  const initials = getInitials(user?.name);

  /** "Invoices" unpaid counter - soft amber pill (guide: amber = attention). */
  const countChip = () => (
    <Box
      component="span"
      aria-label={`${unpaidCount} unpaid`}
      sx={{
        ml: "auto",
        minWidth: 20,
        px: "6px",
        py: "1px",
        borderRadius: "999px",
        bgcolor: d.amber,
        color: d.warning,
        fontSize: 10,
        fontWeight: 650,
        lineHeight: 1.6,
        textAlign: "center",
      }}
    >
      {unpaidCount}
    </Box>
  );

  const iconBtnSx = {
    position: "relative",
    width: 40,
    height: 40,
    border: `1px solid ${d.border}`,
    bgcolor: d.surface,
    borderRadius: "10px",
    color: d.muted,
    "&:hover": { bgcolor: d.hover },
    "&:focus-visible": focusRing(d.action),
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

  /** Brand mark. The source image has generous transparent padding, so
   *  "cover" crops it to sit snugly in the given box. */
  const logo = (width: number, height: number) => (
    <Box sx={{ position: "relative", width, height, flexShrink: 0 }}>
      <Image
        src="/BitfactoryLogo.webp"
        alt="BitFactory Logo"
        fill
        priority
        sizes={`${width}px`}
        style={{ objectFit: "cover" }}
      />
    </Box>
  );

  const navLabel = (text: string, first = false) => (
    <Box
      component="p"
      sx={{
        m: 0,
        mt: first ? 0 : "22px",
        mb: "8px",
        px: "15px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: ".17em",
        textTransform: "uppercase",
        color: d.muted,
      }}
    >
      {text}
    </Box>
  );

  const navItem = (
    link: NavLink,
    {
      minHeight = 40,
      onNavigate,
    }: { minHeight?: number; onNavigate?: () => void } = {},
  ) => {
    const active = isActive(link.href);
    return (
      <ButtonBase
        key={link.href}
        component={Link}
        href={link.href}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          trackTab(link.href, link.label);
          onNavigate?.();
        }}
        sx={{
          display: "flex",
          width: "100%",
          justifyContent: "flex-start",
          gap: "12px",
          minHeight,
          px: "14px",
          my: "2px",
          borderRadius: "9px",
          fontFamily: fonts.body,
          fontSize: 13,
          fontWeight: active ? 650 : 500,
          textAlign: "left",
          color: active ? d.action : d.muted,
          bgcolor: active ? d.skySoft : "transparent",
          "&:hover": { bgcolor: active ? d.skySoft : d.hover },
          "&:focus-visible": focusRing(d.action),
          "& > svg": { fontSize: 20, flexShrink: 0 },
        }}
      >
        {link.icon}
        {link.label}
        {link.href === "/invoices" && unpaidCount > 0 ? countChip() : null}
      </ButtonBase>
    );
  };

  const navGroups = (opts?: {
    minHeight?: number;
    onNavigate?: () => void;
  }) => (
    <>
      {navLabel("Menu", true)}
      {mainLinks.map((l) => navItem(l, opts))}
      {navLabel("Market & tools")}
      {toolLinks.map((l) => navItem(l, opts))}
    </>
  );

  return (
    <>
      {/* Shift the page to make room for the sidebar; on phones reserve room
          for the fixed bottom navigation instead. */}
      <GlobalStyles
        styles={{
          body: sidebarWidthStyles("paddingLeft"),
          [MQ.mobile]: {
            body: {
              paddingBottom: `calc(${BOTTOM_NAV_HEIGHT}px + ${SAFE_BOTTOM})`,
            },
          },
        }}
      />

      {/* Sidebar (>= 700px) */}
      <Box
        component="aside"
        aria-label="Sidebar"
        sx={{
          position: "fixed",
          top: 0,
          bottom: 0,
          left: 0,
          display: "flex",
          flexDirection: "column",
          ...sidebarWidthStyles("width"),
          [MQ.mobile]: { display: "none" },
          overflowY: "auto",
          p: "26px 16px 18px",
          bgcolor: d.surface,
          borderRight: `1px solid ${d.border}`,
          zIndex: 1202,
          fontFamily: fonts.body,
          color: d.text,
        }}
      >
        <Link
          href="/dashboard"
          aria-label="BitFactory dashboard"
          style={{ display: "block", padding: "0 4px" }}
        >
          <Box
            sx={{
              position: "relative",
              width: "100%",
              maxWidth: 168,
              aspectRatio: "168 / 52",
            }}
          >
            <Image
              src="/BitfactoryLogo.webp"
              alt="BitFactory Logo"
              fill
              priority
              sizes="168px"
              style={{ objectFit: "cover" }}
            />
          </Box>
        </Link>

        {/* User card */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            m: "22px 4px 26px",
            p: "11px 10px",
            bgcolor: d.canvas,
            border: `1px solid ${d.border}`,
            borderRadius: "10px",
            fontSize: 12,
            minWidth: 0,
          }}
        >
          <Box
            aria-hidden
            sx={{
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              width: 30,
              height: 30,
              borderRadius: "50%",
              bgcolor: d.skySoft,
              color: d.action,
              fontSize: 11,
              fontWeight: 650,
            }}
          >
            {initials || <AccountCircle fontSize="small" />}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Box
              sx={{
                fontWeight: 650,
                color: d.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.name || "Client account"}
            </Box>
            <Box
              sx={{
                fontSize: 10,
                color: d.muted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.email ?? ""}
            </Box>
          </Box>
        </Box>

        <Box component="nav" aria-label="Primary" sx={{ flexShrink: 0 }}>
          {navGroups()}
        </Box>

        {/* Help card + footer */}
        <Box sx={{ mt: "auto", pt: "18px" }}>
          <Box
            sx={{
              m: "0 4px 18px",
              p: "17px",
              background: darkMode
                ? d.skySoft
                : "linear-gradient(140deg, #EFF8FF, #F4FBF8)",
              border: `1px solid ${darkMode ? d.borderSky : "#DEEDF3"}`,
              borderRadius: "12px",
            }}
          >
            <Box sx={{ fontWeight: 650, fontSize: 13, color: d.text }}>
              Need help?
            </Box>
            <Box
              component="p"
              sx={{ m: "8px 0 12px", fontSize: 12, color: d.muted }}
            >
              Questions about your miners, wallet or invoices? We&rsquo;re here
              to help.
            </Box>
            <Box
              component={Link}
              href="/support"
              sx={{
                fontSize: 12,
                fontWeight: 650,
                color: d.action,
                textDecoration: "none",
                "&:hover": { color: d.actionHover },
                "&:focus-visible": focusRing(d.action),
              }}
            >
              Contact support
            </Box>
          </Box>
          <Box sx={{ px: "12px", fontSize: 10, color: d.muted }}>
            © {new Date().getFullYear()} BitFactory
          </Box>
        </Box>
      </Box>

      {/* Top bar: 76px on desktop (right of the sidebar), 72px mobile bar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: 1201,
          ...sidebarWidthStyles("left"),
          right: 0,
          width: "auto",
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
            height: HEADER_HEIGHT.mobile,
            minHeight: HEADER_HEIGHT.mobile,
            px: "18px",
            gap: 1.5,
            [MQ.desktop]: {
              height: HEADER_HEIGHT.desktop,
              minHeight: HEADER_HEIGHT.desktop,
              px: "24px",
            },
            "@media (min-width:1191px)": { px: "36px" },
          }}
        >
          {/* Mobile: brand */}
          <Box
            sx={{
              display: "block",
              [MQ.desktop]: { display: "none" },
              flexShrink: 0,
            }}
          >
            <Link
              href="/dashboard"
              aria-label="BitFactory dashboard"
              style={{ display: "block" }}
            >
              {logo(132, 40)}
            </Link>
          </Box>

          {/* Desktop: breadcrumb */}
          <Box
            component="nav"
            aria-label="Breadcrumb"
            sx={{
              display: "none",
              [MQ.desktop]: { display: "flex" },
              alignItems: "center",
              gap: "12px",
              fontSize: 12,
              color: d.muted,
              minWidth: 0,
            }}
          >
            <span>BitFactory</span>
            <span aria-hidden>/</span>
            <Box
              component="b"
              aria-current="page"
              sx={{ fontWeight: 500, color: d.text }}
            >
              {currentLabel}
            </Box>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {/* Subaccount filter - only shown for CLIENT users with more than
              one Luxor subaccount to pick from. */}
          {user?.role === "CLIENT" && availableSubaccounts.length > 1 && (
            <>
              <IconButton
                onClick={handleSubaccountMenu}
                aria-label="Filter by subaccount"
                aria-haspopup="menu"
                aria-expanded={Boolean(subaccountAnchorEl)}
                sx={iconBtnSx}
              >
                <AccountTreeOutlinedIcon />
              </IconButton>
              <Menu
                anchorEl={subaccountAnchorEl}
                open={Boolean(subaccountAnchorEl)}
                onClose={handleSubaccountMenuClose}
                slotProps={{ paper: { sx: menuPaperSx } }}
              >
                <MenuItem onClick={() => setSelectedSubaccounts("all")} dense>
                  <ListItemIcon>
                    {selectedSubaccounts === "all" && (
                      <CheckIcon fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText>All subaccounts</ListItemText>
                </MenuItem>
                {availableSubaccounts.map((sub) => (
                  <MenuItem
                    key={sub.authKey}
                    onClick={() => toggleSubaccount(sub.authKey)}
                    dense
                  >
                    <ListItemIcon>
                      <Checkbox
                        edge="start"
                        size="small"
                        checked={
                          selectedSubaccounts === "all" ||
                          selectedSubaccounts.includes(sub.authKey)
                        }
                        tabIndex={-1}
                        disableRipple
                      />
                    </ListItemIcon>
                    <ListItemText>{sub.authKey}</ListItemText>
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}

          {/* Dark Mode Toggle */}
          <IconButton
            onClick={toggleDarkMode}
            aria-label={
              darkMode ? "Switch to light mode" : "Switch to dark mode"
            }
            sx={iconBtnSx}
          >
            {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>

          {/* Account Menu */}
          <IconButton
            onClick={handleMenu}
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={Boolean(anchorEl)}
            sx={{
              ...iconBtnSx,
              borderRadius: "50%",
              bgcolor: initials ? d.skySoft : d.surface,
              color: d.action,
              fontFamily: fonts.body,
              fontSize: 12,
              fontWeight: 650,
              "&:hover": { bgcolor: initials ? d.skySoft : d.hover },
            }}
          >
            {initials || <AccountCircle />}
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleClose}
            slotProps={{ paper: { sx: menuPaperSx } }}
          >
            {user?.role === "FRANCHISEE" && (
              <MenuItem
                component={Link}
                href="/franchise/dashboard"
                onClick={handleClose}
              >
                Franchise Dashboard
              </MenuItem>
            )}
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
            <MenuItem component={Link} href="/support" onClick={handleClose}>
              Support
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

      {/* Mobile drawer: full navigation */}
      <Drawer
        anchor="left"
        open={mobileNavOpen}
        onClose={handleCloseMobileNav}
        slotProps={{
          paper: {
            sx: {
              width: "100%",
              maxWidth: 280,
              backgroundColor: d.surface,
              backgroundImage: "none",
              color: d.text,
              borderRight: `1px solid ${d.border}`,
              fontFamily: fonts.body,
            },
          },
          backdrop: { sx: { backgroundColor: "rgba(100,114,124,.22)" } },
        }}
      >
        <Box
          sx={{
            px: 2,
            height: HEADER_HEIGHT.mobile,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${d.border}`,
          }}
        >
          <Link
            href="/dashboard"
            onClick={handleCloseMobileNav}
            aria-label="BitFactory dashboard"
            style={{ display: "block" }}
          >
            {logo(132, 40)}
          </Link>
          <IconButton
            onClick={handleCloseMobileNav}
            aria-label="Close navigation menu"
            sx={iconBtnSx}
          >
            <CloseRoundedIcon />
          </IconButton>
        </Box>

        <Box
          component="nav"
          aria-label="All pages"
          sx={{ p: 1.5, overflowY: "auto" }}
        >
          {navGroups({ minHeight: 44, onNavigate: handleCloseMobileNav })}
        </Box>
      </Drawer>

      {/* Bottom navigation - phones only (< 700px) */}
      <Box
        component="nav"
        aria-label="Quick navigation"
        sx={{
          display: "none",
          [MQ.mobile]: { display: "flex" },
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: `calc(${BOTTOM_NAV_HEIGHT}px + ${SAFE_BOTTOM})`,
          pb: SAFE_BOTTOM,
          bgcolor: d.surface,
          borderTop: `1px solid ${d.border}`,
          // Above page content, below the drawer/menus (which sit at 1300+).
          zIndex: 1200,
          justifyContent: "space-around",
          fontFamily: fonts.body,
        }}
      >
        {mobileTabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <ButtonBase
              key={tab.href}
              component={Link}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              onClick={() => trackTab(tab.href, tab.label)}
              sx={{
                flex: 1,
                flexDirection: "column",
                gap: "4px",
                minWidth: 56,
                minHeight: 44,
                fontFamily: fonts.body,
                fontSize: 10,
                fontWeight: active ? 650 : 500,
                color: active ? d.action : d.muted,
                "&:focus-visible": {
                  ...focusRing(d.action),
                  outlineOffset: "-3px",
                },
              }}
            >
              <Box sx={{ position: "relative", display: "flex" }}>
                {tab.icon}
                {tab.href === "/invoices" && unpaidCount > 0 && (
                  <Box
                    component="span"
                    aria-label={`${unpaidCount} unpaid`}
                    sx={{
                      position: "absolute",
                      top: -6,
                      right: -12,
                      minWidth: 16,
                      px: "4px",
                      borderRadius: "999px",
                      bgcolor: d.amber,
                      color: d.warning,
                      border: `1px solid ${d.borderAmber}`,
                      fontSize: 9,
                      fontWeight: 700,
                      lineHeight: "14px",
                      textAlign: "center",
                    }}
                  >
                    {unpaidCount}
                  </Box>
                )}
              </Box>
              {tab.label}
            </ButtonBase>
          );
        })}
        <ButtonBase
          onClick={handleOpenMobileNav}
          aria-label="Open navigation menu"
          aria-haspopup="dialog"
          sx={{
            flex: 1,
            flexDirection: "column",
            gap: "4px",
            minWidth: 56,
            minHeight: 44,
            fontFamily: fonts.body,
            fontSize: 10,
            fontWeight: 500,
            color: d.muted,
            "&:focus-visible": {
              ...focusRing(d.action),
              outlineOffset: "-3px",
            },
          }}
        >
          <MenuRoundedIcon />
          Menu
        </ButtonBase>
      </Box>
    </>
  );
}
