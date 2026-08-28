"use client";

import React from "react";
import {
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Collapse,
  IconButton,
  Tooltip,
  Badge,
  Drawer,
  Typography,
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  Group as CustomersIcon,
  Memory as HardwareIcon,
  CloudQueue as PoolsIcon,
  LocationOn as LocationsIcon,
  Storage as MinersIcon,
  Timeline as OverviewIcon,
  AttachMoney as RevenueIcon,
  Construction as SelfMiningIcon,
  PriceCheck as HostingPricesIcon,
  Assignment as AccountingIcon,
  Description as DocumentIcon,
  RequestQuote as AdjustmentsIcon,
  Settings as SettingsIcon,
  History as ActivityLogIcon,
  ChevronLeft,
  ChevronRight,
  Lock as LockIcon,
  People as FranchiseesIcon,
  MonetizationOn as IncentivesIcon,
  ReceiptLong as MemoIcon,
  Dataset as DbDataIcon,
  ListAlt as SubaccountRecordsIcon,
  ShowChart as DailySnapshotsIcon,
  Engineering as WorkerMetricsIcon,
  SwapHoriz as PoolTransactionsIcon,
  SupportAgent as SupportIcon,
  AccountBalanceWallet as WalletRequestsIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, useTickets, useWalletChangeRequests } from "@/lib/hooks";
import { useAdminNav } from "@/lib/contexts/admin-nav-context";

interface SidebarItem {
  title: string;
  icon: React.ReactNode;
  path?: string;
  items?: SidebarItem[];
  // Roles allowed to see this item. Defaults to ADMIN/SUPER_ADMIN (today's
  // behavior) when omitted, so existing items don't need to be touched.
  // FRANCHISEE no longer renders this sidebar at all — they get their own
  // dedicated FranchiseSidebar under the (franchise) route group.
  roles?: Array<"ADMIN" | "SUPER_ADMIN">;
  openInNewTab?: boolean;
  badgeCount?: number;
}

const sidebarItems: SidebarItem[] = [
  {
    title: "Dashboard",
    icon: <DashboardIcon />,
    path: "/dashboard",
    // items: [
    //   { title: "Dashboard", icon: <DashboardIcon />, path: "/dashboard" },
    // ],
  },
  {
    title: "Activity Log",
    icon: <ActivityLogIcon />,
    path: "/activity-log",
  },
  {
    title: "Franchisees",
    icon: <FranchiseesIcon />,
    path: "/franchisees",
  },
  {
    title: "Incentive Payouts",
    icon: <IncentivesIcon />,
    path: "/incentives/payouts",
  },
  {
    title: "Support Tickets",
    icon: <SupportIcon />,
    path: "/tickets",
  },
  {
    title: "Wallet Requests",
    icon: <WalletRequestsIcon />,
    path: "/wallet-requests",
  },
  {
    title: "Customers",
    icon: <CustomersIcon />,
    path: "/customers/overview",
    // items: [
    //   {
    //     title: "Overview",
    //     icon: <OverviewIcon />,
    //     path: "/customers/overview",
    //   },
    //   {
    //     title: "Own Revenue",
    //     icon: <RevenueIcon />,
    //     path: "/customers/revenue",
    //   },
    //   {
    //     title: "Own Transactions",
    //     icon: <TransactionsIcon />,
    //     path: "/customers/transactions",
    //   },
    // ],
  },
  {
    title: "Subaccounts",
    icon: <CustomersIcon />,
    path: "/subaccounts",
  },

  {
    title: "Customer Groups",
    icon: <CustomersIcon />,
    path: "/groups",
  },

  {
    title: "Pools",
    icon: <PoolsIcon />,
    path: "/pools",
  },

  {
    title: "All Miners",
    icon: <MinersIcon />,
    path: "/machine",
  },

  {
    title: "Luxor Workers",
    icon: <MinersIcon />,
    path: "/workers",
  },

  {
    title: "Braiins Workers",
    icon: <MinersIcon />,
    path: "/braiins-workers",
  },

  {
    title: "Locations",
    icon: <LocationsIcon />,
    path: "/space",
  },

  {
    title: "Hardware Models",
    icon: <HardwareIcon />,
    path: "/hardware",
  },

  {
    title: "Accounting",
    icon: <AccountingIcon />,
    items: [
      {
        title: "Hosting and Colocation",
        icon: <DashboardIcon />,
        path: "/accounting/Hosting-and-Colocation",
      },
      {
        title: "Farm Tariffs",
        icon: <DocumentIcon />,
        path: "/accounting/farm-tariffs",
      },
      {
        title: "Hardware Sales Dashboard",
        icon: <DashboardIcon />,
        path: "/accounting/hardware-sales",
      },
      {
        title: "Hardware Purchase Invoices",
        icon: <DocumentIcon />,
        path: "/accounting/hardware-purchases",
      },
      // {
      //   title: "Invoices",
      //   icon: <InvoicesIcon />,
      //   path: "/accounting/invoices",
      // },
      {
        title: "Memos",
        icon: <MemoIcon />,
        path: "/accounting/memos",
      },
      {
        title: "Customer Statements",
        icon: <OverviewIcon />,
        path: "/accounting/statements",
      },
      {
        title: "Credit Adjustments",
        icon: <AdjustmentsIcon />,
        path: "/accounting/credit-adjustments",
      },
      {
        title: "Client Transaction History",
        icon: <DocumentIcon />,
        path: "/accounting/client-transaction-history",
      },
      {
        title: "Email Reports",
        icon: <DocumentIcon />,
        path: "/accounting/email-report",
      },
      {
        title: "Invoice PDF Settings",
        icon: <DocumentIcon />,
        path: "/accounting/pdf-invoice-settings",
      },
      {
        title: "Recurring Invoices",
        icon: <RevenueIcon />,
        path: "/accounting/recurring",
      },
      {
        title: "Pricing",
        icon: <HostingPricesIcon />,
        path: "/accounting/pricing",
      },
    ],
  },
  {
    title: "DB Data Management",
    icon: <DbDataIcon />,
    items: [
      {
        title: "Subaccount Records",
        icon: <SubaccountRecordsIcon />,
        path: "/db-data-management/pool-subaccounts",
      },
      {
        title: "Daily Snapshots",
        icon: <DailySnapshotsIcon />,
        path: "/db-data-management/pool-daily-snapshots",
      },
      {
        title: "Worker Metrics",
        icon: <WorkerMetricsIcon />,
        path: "/db-data-management/pool-worker-metrics",
      },
      {
        title: "Pool Transactions",
        icon: <PoolTransactionsIcon />,
        path: "/db-data-management/pool-transactions",
      },
    ],
  },
  {
    title: "Payback Analysis",
    icon: <OverviewIcon />,
    path: "/admin/payback-analysis",
  },
  {
    title: "Payback Analysis Settings",
    icon: <SettingsIcon />,
    path: "/admin/payback-analysis-settings",
  },
  {
    title: "Company Payback Analysis",
    icon: <SelfMiningIcon />,
    path: "/admin/payback-analysis-company",
  },
  {
    title: "Company Payback Settings",
    icon: <SettingsIcon />,
    path: "/admin/payback-analysis-company-settings",
  },
];

export default function AdminSidebar() {
  const [sideBarOpen, setSideBarOpen] = React.useState(true);
  const [isHovered, setIsHovered] = React.useState(false);
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = React.useState<string[]>([]);
  const { user } = useUser();
  const { mobileOpen, setMobileOpen } = useAdminNav();
  const { tickets: openTickets } = useTickets({ status: "OPEN" });
  const { requests: pendingWalletRequests } = useWalletChangeRequests({
    status: "PENDING",
  });

  const visibleSidebarItems = sidebarItems
    .filter((item) => {
      const allowedRoles = item.roles ?? ["ADMIN", "SUPER_ADMIN"];
      return user ? (allowedRoles as string[]).includes(user.role) : false;
    })
    .map((item) => {
      if (item.title === "Support Tickets") {
        return { ...item, badgeCount: openTickets.length };
      }
      if (item.title === "Wallet Requests") {
        return { ...item, badgeCount: pendingWalletRequests.length };
      }
      return item;
    });

  const handleExpandClick = (title: string, isMobile = false) => {
    if (!isMobile && !sideBarOpen && !isHovered) return;
    setExpandedItems((prev) =>
      prev.includes(title)
        ? prev.filter((item) => item !== title)
        : [...prev, title],
    );
  };

  const toggleCollapse = () => {
    setSideBarOpen((prev) => !prev);
    // Close all expanded items when collapsing
    if (sideBarOpen) {
      setExpandedItems([]);
    }
  };

  const handleMouseEnter = () => {
    if (!sideBarOpen) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (!sideBarOpen) {
      setExpandedItems([]);
    }
  };

  const renderSidebarItems = (items: SidebarItem[], isMobile = false) => {
    const isExpanded = isMobile || sideBarOpen || isHovered;
    return items.map((item) => (
      <React.Fragment key={item.title}>
        <ListItem disablePadding>
          <Tooltip title={isExpanded ? "" : item.title} placement="right" arrow>
            <ListItemButton
              component={item.path ? Link : "div"}
              href={item.path || "#"}
              target={item.openInNewTab ? "_blank" : undefined}
              rel={item.openInNewTab ? "noopener noreferrer" : undefined}
              onClick={() => {
                if (item.items) {
                  handleExpandClick(item.title, isMobile);
                } else if (isMobile) {
                  setMobileOpen(false);
                }
              }}
              selected={item.path === pathname}
              sx={{
                borderRadius: 1.5,
                mb: 0.5,
                color: "text.secondary",
                minHeight: 44,
                "&.Mui-selected": {
                  color: "primary.main",
                  bgcolor: "action.selected",
                  fontWeight: 600,
                  "& .MuiListItemIcon-root": {
                    color: "primary.main",
                  },
                },
                "&:hover": {
                  bgcolor: "action.hover",
                },
                justifyContent: isExpanded ? "flex-start" : "center",
                px: isExpanded ? 1.5 : 2,
                whiteSpace: "nowrap",
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: isExpanded ? 40 : 0,
                  color: "inherit",
                  justifyContent: "center",
                }}
              >
                {item.badgeCount ? (
                  <Badge
                    color="error"
                    badgeContent={item.badgeCount}
                    max={99}
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
                    {item.icon}
                  </Badge>
                ) : (
                  item.icon
                )}
              </ListItemIcon>
              {isExpanded && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    justifyContent: "space-between",
                  }}
                >
                  <ListItemText
                    primary={item.title}
                    primaryTypographyProps={{
                      fontSize: "0.875rem",
                      fontWeight: item.path === pathname ? 600 : 400,
                    }}
                  />
                  {item.items && (
                    <ChevronLeft
                      sx={{
                        fontSize: "1.25rem",
                        transition: (theme) =>
                          theme.transitions.create("transform", {
                            duration: theme.transitions.duration.shorter,
                            easing: theme.transitions.easing.easeInOut,
                          }),
                        transform: expandedItems.includes(item.title)
                          ? "rotate(90deg)"
                          : "rotate(-90deg)",
                      }}
                    />
                  )}
                </Box>
              )}
            </ListItemButton>
          </Tooltip>
        </ListItem>
        {isExpanded && item.items && (
          <Collapse
            in={expandedItems.includes(item.title)}
            timeout="auto"
            unmountOnExit
          >
            <List component="div" disablePadding>
              {item.items.map((subItem) => (
                <Tooltip
                  key={subItem.title}
                  title={isExpanded ? "" : subItem.title}
                  placement="right"
                  arrow
                >
                  <ListItemButton
                    component={Link}
                    href={subItem.path || "#"}
                    onClick={() => {
                      if (isMobile) {
                        setMobileOpen(false);
                      }
                    }}
                    selected={subItem.path === pathname}
                    sx={{
                      pl: 4,
                      py: 1,
                      borderRadius: 1.5,
                      mb: 0.5,
                      color: "text.secondary",
                      minHeight: 40,
                      "&.Mui-selected": {
                        color: "primary.main",
                        bgcolor: "action.selected",
                        fontWeight: 600,
                        "& .MuiListItemIcon-root": {
                          color: "primary.main",
                        },
                      },
                      "&:hover": {
                        bgcolor: "action.hover",
                      },
                      justifyContent: isExpanded ? "flex-start" : "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: isExpanded ? 40 : 0,
                        color: "inherit",
                        justifyContent: "center",
                      }}
                    >
                      {subItem.icon}
                    </ListItemIcon>
                    {isExpanded && (
                      <ListItemText
                        primary={subItem.title}
                        primaryTypographyProps={{
                          fontSize: "0.85rem",
                          fontWeight: subItem.path === pathname ? 600 : 400,
                        }}
                      />
                    )}
                  </ListItemButton>
                </Tooltip>
              ))}
            </List>
          </Collapse>
        )}
      </React.Fragment>
    ));
  };

  return (
    <>
      {/* Mobile Drawer (xs, sm) */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: 280,
            backgroundColor: "background.paper",
            backgroundImage: "none",
            p: 1.5,
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 1,
            py: 1,
            mb: 1,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Typography variant="subtitle1" fontWeight="700">
            Admin Navigation
          </Typography>
          <IconButton
            size="small"
            onClick={() => setMobileOpen(false)}
            aria-label="close drawer"
          >
            <CloseIcon />
          </IconButton>
        </Box>
        <List sx={{ px: 0 }}>
          {renderSidebarItems(visibleSidebarItems, true)}
        </List>
      </Drawer>

      {/* Desktop Collapsible Sidebar (md and up) */}
      <Box
        component="nav"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        sx={{
          display: { xs: "none", md: "block" },
          width: sideBarOpen || isHovered ? 280 : 72,
          flexShrink: 0,
          borderRight: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          overflow: "hidden",
          transition: (theme) =>
            theme.transitions.create(["width"], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.standard,
            }),
          "&:hover": {
            overflowY: "auto",
          },
          "&::-webkit-scrollbar": {
            width: "4px",
          },
          "&::-webkit-scrollbar-track": {
            background: "transparent",
          },
          "&::-webkit-scrollbar-thumb": {
            background: "rgba(0,0,0,0.2)",
            borderRadius: "2px",
          },
          "&:hover::-webkit-scrollbar-thumb": {
            background: "rgba(0,0,0,0.3)",
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 3,
            position: "relative",
          }}
        >
          <IconButton
            onClick={toggleCollapse}
            sx={{
              backgroundColor: "transparent",
              "&:hover": {
                backgroundColor: "transparent",
              },
              mt: 13,
              position: "absolute",
              right: 0,
              zIndex: 1,
              display: "flex",
              gap: 0.5,
            }}
          >
            {sideBarOpen || isHovered ? <ChevronLeft /> : <ChevronRight />}
            {sideBarOpen && <LockIcon sx={{ fontSize: "0.75rem" }} />}
          </IconButton>
        </Box>
        <List sx={{ px: sideBarOpen || isHovered ? 2 : 1 }}>
          {renderSidebarItems(visibleSidebarItems, false)}
        </List>
      </Box>
    </>
  );
}
